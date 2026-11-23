import { Eye, EyeOff } from 'lucide-react'
import { toggleHiddenPlaylist, useHiddenPlaylists } from '../playlists'
import { ContextMenu, MenuItem, type MenuPos } from './ContextMenu'

/** The right-click menu of a playlist, radio or mix wherever it is listed. */
export function PlaylistMenu({ id, pos, onClose }: { id: string; pos: MenuPos; onClose: () => void }) {
  const hidden = useHiddenPlaylists().includes(id)
  return (
    <ContextMenu pos={pos} onClose={onClose}>
      <MenuItem
        icon={hidden ? <Eye size={14} /> : <EyeOff size={14} />}
        onClick={() => {
          toggleHiddenPlaylist(id)
          onClose()
        }}
      >
        {hidden ? 'Show in Your Library' : 'Hide from Your Library'}
      </MenuItem>
    </ContextMenu>
  )
}
