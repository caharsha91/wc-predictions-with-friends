export type Member = {
  id: string
  name: string
  handle?: string
  email?: string
  isAdmin?: boolean
}

export type MembersFile = {
  members: Member[]
}
