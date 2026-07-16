from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Design, Edge, Node
from app.schemas.edges import EdgeCreate, EdgeResponse, EdgeUpdate

router = APIRouter()

# ---------------------------------------------------------------------------
# Auto-handle helpers
# ---------------------------------------------------------------------------


async def _walk_y(db: AsyncSession, node: Node) -> float:
    """Accumulate absolute canvas Y starting from an already-loaded Node.

    Walks up the parent_id chain (up to 8 levels) using the session identity
    map so shared ancestors are fetched at most once per request.
    """
    y = node.pos_y
    current = node
    for _ in range(8):
        if current.parent_id is None:
            break
        parent = await db.get(Node, current.parent_id)
        if parent is None:
            break
        y += parent.pos_y
        current = parent
    return y


async def _abs_y(db: AsyncSession, node_id: str) -> float | None:
    """Resolve the approximate absolute canvas Y of a node.

    Thin wrapper around _walk_y for callers that only have a node ID.
    Returns None when the node is not found.
    """
    node = await db.get(Node, node_id)
    if node is None:
        return None
    return await _walk_y(db, node)


async def _auto_handles(
    db: AsyncSession, source_id: str, target_id: str
) -> tuple[str, str]:
    """Return (source_handle, target_handle) based on canvas Y positions.

    Loads both endpoint nodes in a single batch query so the session identity
    map can cache shared ancestors (e.g. two VMs on the same Proxmox host).
    """
    result = await db.execute(select(Node).where(Node.id.in_([source_id, target_id])))
    node_map = {n.id: n for n in result.scalars()}

    src_node = node_map.get(source_id)
    tgt_node = node_map.get(target_id)

    src_y = await _walk_y(db, src_node) if src_node else None
    tgt_y = await _walk_y(db, tgt_node) if tgt_node else None

    if src_y is None or tgt_y is None or src_y <= tgt_y:
        return "bottom", "top-t"
    return "top", "bottom-t"


@router.get("", response_model=list[EdgeResponse])
async def list_edges(db: AsyncSession = Depends(get_db), _: str = Depends(get_current_user)) -> list[Edge]:
    result = await db.execute(select(Edge))
    return list(result.scalars().all())


@router.post("", response_model=EdgeResponse, status_code=status.HTTP_201_CREATED)
async def create_edge(body: EdgeCreate, db: AsyncSession = Depends(get_db), _: str = Depends(get_current_user)) -> Edge:
    data = body.model_dump()
    # Same reconciliation as nodes: clients omitting design_id (MCP write tools)
    # would create design_id=null edges that never render until a restart.
    # Fall back to the first design so the edge attaches to a canvas.
    if data.get("design_id") is None:
        first_design = (await db.execute(select(Design).order_by(Design.created_at).limit(1))).scalar()
        data["design_id"] = first_design.id if first_design else None

    # Auto-assign source/target handles when the caller omits them.
    # Compares the canvas Y positions of both nodes so that the edge always exits
    # the upstream node's bottom and enters the downstream node's top (or vice versa
    # for reverse flows), matching the UI convention for top-to-bottom topologies.
    if data.get("source_handle") is None or data.get("target_handle") is None:
        auto_src, auto_tgt = await _auto_handles(db, data["source"], data["target"])
        if data.get("source_handle") is None:
            data["source_handle"] = auto_src
        if data.get("target_handle") is None:
            data["target_handle"] = auto_tgt

    edge = Edge(**data)
    db.add(edge)
    await db.commit()
    await db.refresh(edge)
    return edge


@router.delete("/{edge_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_edge(edge_id: str, db: AsyncSession = Depends(get_db), _: str = Depends(get_current_user)) -> None:
    edge = await db.get(Edge, edge_id)
    if not edge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edge not found")
    await db.delete(edge)
    await db.commit()


@router.patch("/{edge_id}", response_model=EdgeResponse)
async def update_edge(
    edge_id: str, body: EdgeUpdate, db: AsyncSession = Depends(get_db), _: str = Depends(get_current_user)
) -> Edge:
    edge = await db.get(Edge, edge_id)
    if not edge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edge not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(edge, field, value)
    await db.commit()
    await db.refresh(edge)
    return edge
