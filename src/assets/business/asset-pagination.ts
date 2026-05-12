export function buildPagination(
  totalCount: number,
  currentPage: number,
  pageSize: number
) {
  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    currentPage,
    pageSize,
    totalCount,
    totalPages,
    hasMore: currentPage < totalPages,
  };
}
