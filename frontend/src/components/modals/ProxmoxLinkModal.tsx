import { useState, useEffect } from 'react'
import { Link2, Server, Box, Container } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ProxmoxNode, ProxmoxNodeType } from '@/components/proxmox/types'
import type { PendingDevice } from '@/components/modals/PendingDeviceModal'

export interface ProxmoxLinkMatch {
  proxmoxNode: ProxmoxNode
  scanDevice: PendingDevice
}

interface ProxmoxLinkModalProps {
  open: boolean
  matches: ProxmoxLinkMatch[]
  unmatchedCount: number
  onApply: (linkedIds: Set<string>) => void
  onSkip: () => void
}

const ACCENT = '#e57000'

const TYPE_ICON: Record<ProxmoxNodeType, typeof Server> = {
  proxmox: Server,
  vm: Box,
  lxc: Container,
}

const TYPE_COLOR: Record<ProxmoxNodeType, string> = {
  proxmox: '#e57000',
  vm: '#00d4ff',
  lxc: '#39d353',
}

export function ProxmoxLinkModal({ open, matches, unmatchedCount, onApply, onSkip }: ProxmoxLinkModalProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set())

  useEffect(() => {
    setChecked(new Set(matches.map((m) => m.proxmoxNode.id)))
  }, [matches])

  const toggleCheck = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const toggleAll = () =>
    setChecked(checked.size === matches.length ? new Set() : new Set(matches.map((m) => m.proxmoxNode.id)))

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onSkip()}>
      <DialogContent className="bg-[#161b22] border-border max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Link2 size={16} style={{ color: ACCENT }} />
            Link to Scanned Inventory
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-2 min-h-0">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Found <span className="text-foreground font-medium">{matches.length}</span> Proxmox node{matches.length !== 1 ? 's' : ''}  that match scanned devices by IP.
            Linked nodes will inherit services, OS, and other scan data from the inventory.
            {unmatchedCount > 0 && (
              <> <span className="text-muted-foreground/70">{unmatchedCount} node{unmatchedCount !== 1 ? 's have' : ' has'} no match and will be added as-is.</span></>
            )}
          </p>

          <div className="flex items-center gap-1.5 pb-1 border-b border-border">
            <input
              type="checkbox"
              checked={checked.size === matches.length && matches.length > 0}
              ref={(el) => { if (el) el.indeterminate = checked.size > 0 && checked.size < matches.length }}
              onChange={toggleAll}
              className="w-3 h-3 cursor-pointer"
              style={{ accentColor: ACCENT }}
              aria-label="Select all matches"
            />
            <span className="text-xs text-muted-foreground">
              Select all ({checked.size}/{matches.length})
            </span>
          </div>

          <div className="space-y-1.5">
            {matches.map(({ proxmoxNode: pn, scanDevice: sd }) => {
              const Icon = TYPE_ICON[pn.type]
              const color = TYPE_COLOR[pn.type]
              const serviceCount = sd.services?.length ?? 0
              const servicePreview = sd.services?.slice(0, 3).map((s) => s.port ?? s.service_name).join(', ')
              return (
                <div
                  key={pn.id}
                  className={`flex items-start gap-2 p-2.5 rounded-md text-xs cursor-pointer border transition-colors ${
                    checked.has(pn.id)
                      ? 'bg-[#21262d] border-[#e57000]/40'
                      : 'bg-[#21262d] border-transparent hover:bg-[#30363d]'
                  }`}
                  onClick={() => toggleCheck(pn.id)}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(pn.id)}
                    onChange={() => toggleCheck(pn.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-3 h-3 mt-0.5 cursor-pointer shrink-0"
                    style={{ accentColor: ACCENT }}
                  />
                  <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        <Icon size={10} style={{ color }} />
                        <span className="text-foreground font-medium truncate">{pn.label}</span>
                      </div>
                      {pn.ip && <div className="font-mono text-[10px] text-muted-foreground">{pn.ip}</div>}
                      <div className="text-[10px] text-muted-foreground capitalize">{pn.type} · {pn.status}</div>
                    </div>
                    <div className="min-w-0 border-l border-border pl-3">
                      <div className="text-[10px] font-medium text-muted-foreground mb-0.5">Scan data</div>
                      {sd.os && <div className="text-[10px] text-foreground/80 truncate">OS: {sd.os}</div>}
                      <div className="text-[10px] text-foreground/80">
                        {serviceCount} service{serviceCount !== 1 ? 's' : ''}
                        {serviceCount > 0 && (
                          <span className="text-muted-foreground">
                            {' '}({servicePreview}{serviceCount > 3 ? '…' : ''})
                          </span>
                        )}
                      </div>
                      {sd.hostname && !sd.hostname.startsWith('pve-') && (
                        <div className="text-[10px] text-muted-foreground truncate">{sd.hostname}</div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 shrink-0 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
            Skip linking
          </Button>
          <Button
            onClick={() => onApply(checked)}
            disabled={checked.size === 0}
            style={{ background: ACCENT, color: '#0d1117' }}
            className="gap-1.5"
          >
            <Link2 size={13} />
            Link {checked.size} node{checked.size !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
