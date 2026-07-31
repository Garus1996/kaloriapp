export const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
};

export const moveDate = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return getDateKey(date);
};

export const getLastSevenDateKeys = (dateKey: string) => {
  const dates: string[] = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    dates.push(moveDate(dateKey, -offset));
  }

  return dates;
};

export const formatShortDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("nb-NO", {
    weekday: "short",
    day: "numeric",
  }).format(date);
};

export const toSafeNumber = (value: unknown) => {
  const parsed =
    typeof value === "string"
      ? Number(value.replace(",", "."))
      : Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
};
