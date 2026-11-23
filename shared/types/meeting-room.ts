export interface MeetingRoomPerson {
  id: string
  name: string
  avatarUrl?: string
}
export type MeetingRoomFormSeed = Pick<MeetingRoomBooking, 'date' | 'start' | 'end' | 'title' | 'notes'>
export type MeetingRoomFormInput = MeetingRoomFormSeed & { participantIds: string[]; revision?: number; removeAttachment?: boolean }
export type MeetingRoomReference = Pick<MeetingRoomBooking, 'id' | 'title' | 'date' | 'start' | 'end'> & { available?: boolean }

export interface MeetingRoomBooking {
  id: string
  date: string
  start: string
  end: string
  title: string
  notes: string
  organizer: MeetingRoomPerson | null
  participants: MeetingRoomPerson[]
  attachmentName: string | null
  canDelete: boolean
  canEdit: boolean
  revision: number
}

export interface MeetingRoomPlanningEntry {
  id: string
  title: string
  startOn: string
  dueOn: string
  timeLabel: string
  start: string
  end: string
  organizer: MeetingRoomPerson | null
  canEdit: boolean
  revision: number
}
