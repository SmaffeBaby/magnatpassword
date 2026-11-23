import type { MeetingRoomBooking } from '../types/meeting-room'

export const meetingRoomOpens = '10:00'
export const meetingRoomCloses = '19:00'
export const meetingRoomFileLimit = 10 * 1024 * 1024
export const meetingRoomParticipantLimit = 25
export const meetingRoomTime = /^([01]\d|2[0-3]):[0-5]\d$/

const moscowClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})
export const meetingRoomClock = (now = new Date()) => moscowClock.format(now)
export const meetingRoomCompleted = (date: string, end: string, clock: string) => `${date} ${end}` <= clock

export function meetingRoomPlanningEntry(booking: MeetingRoomBooking) {
  return {
    id: booking.id, title: booking.title, startOn: booking.date, dueOn: booking.date,
    timeLabel: `${booking.start}–${booking.end}`, start: booking.start, end: booking.end,
    organizer: booking.organizer, canEdit: booking.canEdit, revision: booking.revision
  }
}

export function validMeetingRoomTime(start: string, end: string) {
  return meetingRoomTime.test(start) && meetingRoomTime.test(end)
    && start >= meetingRoomOpens && start < end && end <= meetingRoomCloses
}

export const meetingRoomHours = (() => {
  const hours: string[] = []
  for (let hour = Number(meetingRoomOpens.slice(0, 2)); hour <= Number(meetingRoomCloses.slice(0, 2)); hour++) {
    hours.push(`${String(hour).padStart(2, '0')}:00`)
  }
  return hours
})()

export function meetingRoomSchedule(bookings: MeetingRoomBooking[]) {
  return meetingRoomHours.slice(0, -1).map((start, index) => {
    const end = meetingRoomHours[index + 1]!
    const overlapping = bookings.filter(booking => booking.start < end && booking.end > start)
    const free: { start: string; end: string }[] = []
    let bookedUntil = start
    for (const booking of overlapping) {
      if (booking.start > bookedUntil) free.push({ start: bookedUntil, end: booking.start })
      if (booking.end > bookedUntil) bookedUntil = booking.end
    }
    if (bookedUntil < end) free.push({ start: bookedUntil, end })
    return { start, end, bookings: overlapping, fullyBooked: !free.length, free }
  })
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const opens = minutes(meetingRoomOpens)
const closes = minutes(meetingRoomCloses)
export const meetingRoomDayMinutes = closes - opens
const format = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`

export type MeetingRoomGridStep = 5 | 10
export type MeetingRoomDragMode = 'move' | 'start' | 'end'

export function meetingRoomTicks(step: MeetingRoomGridStep) {
  return Array.from({ length: meetingRoomDayMinutes / step }, (_, index) => format(opens + index * step))
}

export function meetingRoomBar(start: string, end: string) {
  return {
    left: `${(minutes(start) - opens) / meetingRoomDayMinutes * 100}%`,
    width: `${(minutes(end) - minutes(start)) / meetingRoomDayMinutes * 100}%`
  }
}

export function adjustMeetingRoomInterval(start: string, end: string, delta: number, step: MeetingRoomGridStep, mode: MeetingRoomDragMode) {
  if (!Math.round(delta)) return { start, end }
  const first = minutes(start)
  const last = minutes(end)
  const snap = (value: number) => opens + Math.round((value + delta - opens) / step) * step
  if (mode === 'start') {
    const latest = Math.floor((last - 1 - opens) / step) * step + opens
    return { start: format(Math.min(latest, Math.max(opens, snap(first)))), end }
  }
  if (mode === 'end') {
    const earliest = Math.ceil((first + 1 - opens) / step) * step + opens
    return { start, end: format(Math.min(closes, Math.max(earliest, snap(last)))) }
  }
  const duration = last - first
  const shifted = Math.min(closes - duration, Math.max(opens, snap(first)))
  return { start: format(shifted), end: format(shifted + duration) }
}
