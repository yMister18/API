export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export function parsePagination(query: PageQuery, defaultPageSize = 20, maxPageSize = 100) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, Number(query.pageSize) || defaultPageSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
