export const getPageCount = (total: number, pageSize: number) =>
  Math.max(1, Math.ceil(total / pageSize));

export const getPageItems = <T>(items: T[], page: number, pageSize: number) =>
  items.slice((page - 1) * pageSize, page * pageSize);
