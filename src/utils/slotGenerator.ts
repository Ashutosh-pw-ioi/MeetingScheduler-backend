import { DateTime } from 'luxon';

const TIME_ZONE = 'Asia/Kolkata';

export const generateAvailabilitySlots = ({
  date,
  startTime,
  endTime,
  now = DateTime.now().setZone(TIME_ZONE),
}: {
  date: string;
  startTime: string;
  endTime: string;
  now?: DateTime;
}) => {
  const slots: { startTime: Date; endTime: Date }[] = [];

  // Create DateTime objects with explicit IST timezone
  const startDateTime = DateTime.fromISO(`${date}T${startTime}`, { zone: TIME_ZONE });
  const endDateTime = DateTime.fromISO(`${date}T${endTime}`, { zone: TIME_ZONE });

  if (!startDateTime.isValid || !endDateTime.isValid || startDateTime >= endDateTime) {
    console.error('Invalid date/time:', { startDateTime, endDateTime });
    return [];
  }

  let slotStart = startDateTime;

  while (slotStart < endDateTime) {
    const slotEnd = slotStart.plus({ minutes: 30 });

    if (slotEnd > endDateTime) break;
    if (slotStart > now) {
      // Convert to JavaScript Date objects while preserving the timezone
      slots.push({
        startTime: slotStart.toJSDate(),
        endTime: slotEnd.toJSDate(),
      });
    }

    slotStart = slotEnd;
  }

  return slots;
};
