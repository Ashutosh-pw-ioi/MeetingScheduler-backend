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

  // Create DateTime objects with the specified timezone
  const startDateTime = DateTime.fromISO(`${date}T${startTime}`, { zone: TIME_ZONE });
  const endDateTime = DateTime.fromISO(`${date}T${endTime}`, { zone: TIME_ZONE });

  // Validate the inputs
  if (!startDateTime.isValid || !endDateTime.isValid || startDateTime >= endDateTime) {
    console.error('Invalid date/time range provided to slot generator:', { date, startTime, endTime });
    return [];
  }

  let slotStart = startDateTime;

  while (slotStart < endDateTime) {
    const slotEnd = slotStart.plus({ minutes: 30 });

    if (slotEnd > endDateTime) {
      break; // Do not create a partial slot at the end
    }

    // Only create slots that start in the future
    if (slotStart > now) {
      slots.push({
        startTime: slotStart.toJSDate(), // Convert to standard JS Date for Prisma
        endTime: slotEnd.toJSDate(),
      });
    }

    slotStart = slotEnd;
  }

  return slots;
};