/** The "Your Mac" house outside the fence: the rest of the computer, which the dog never gets. */
export type MacRoomId = 'documents' | 'photos' | 'ssh' | 'passwords';

/** Rooms top to bottom, with the Kenney prop shown in each (sheet + frame). */
export const macRooms: { id: MacRoomId; label: string; sheet: 'town' | 'dungeon'; frame: number }[] = [
  { id: 'documents', label: 'Documents', sheet: 'dungeon', frame: 63 },
  { id: 'photos', label: 'Photos', sheet: 'town', frame: 125 },
  { id: 'ssh', label: 'SSH keys', sheet: 'town', frame: 117 },
  { id: 'passwords', label: 'Passwords', sheet: 'dungeon', frame: 89 },
];

// Display only: which room a blocked path (from fence.blocked `target`) visibly points at.
// Most specific first; paths that match nothing get no pointer.
const patterns: [MacRoomId, RegExp][] = [
  ['ssh', /(^|\/)\.ssh(\/|$)|\bid_(rsa|ed25519|ecdsa)\b|\.pem$/i],
  ['passwords', /passw(or)?d|keychain|credential|secret|\.env(\.|$)|\.netrc$/i],
  ['photos', /(^|\/)(pictures|photos)(\/|$)|\.(jpe?g|png|heic|gif)$/i],
  ['documents', /(^|\/)(documents|desktop|downloads)(\/|$)|\.(pdf|docx?|xlsx?|txt)$/i],
];

export function macRoomFor(target: string): MacRoomId | null {
  return patterns.find(([, pattern]) => pattern.test(target))?.[0] ?? null;
}
