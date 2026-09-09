namespace FamilyShop.Application.Common;

public record PagedResult<T>(IReadOnlyList<T> Items, int TotalCount, int Page, int PageSize)
{
    public bool HasMore => Page * PageSize < TotalCount;
}
