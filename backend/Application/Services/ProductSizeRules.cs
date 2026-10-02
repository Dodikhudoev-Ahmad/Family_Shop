using Application.Common;

namespace Application.Services;

/// <summary>The rules for a product's selectable sizes against the grid of its type (see Domain SizeGrids). The grid
/// depends on the product's category and type, so this runs in the service, next to the structural FluentValidation rules.</summary>
public static class ProductSizeRules
{
    public const string NoSizesForType = "Для этого типа товаров размеры не используются.";
    public const string AtLeastOneSize = "Выберите хотя бы один размер.";

    /// <summary>Checks the requested sizes and returns what to store: <c>null</c> means "every size of the grid" (also the
    /// result for a full selection, so a later grid change can't leave a stale copy) and is the only value for a type
    /// without a grid. A non-null result is ordered like the grid.</summary>
    public static Result<List<string>?> Normalize(IReadOnlyList<string>? requested, IReadOnlyList<string> grid)
    {
        if (grid.Count == 0)
        {
            return requested is { Count: > 0 }
                ? Result<List<string>?>.Failure(NoSizesForType)
                : Result<List<string>?>.Success(null);
        }

        if (requested is null)
        {
            return Result<List<string>?>.Success(null);
        }

        if (requested.Count == 0)
        {
            return Result<List<string>?>.Failure(AtLeastOneSize);
        }

        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var size in requested)
        {
            if (string.IsNullOrWhiteSpace(size))
            {
                return Result<List<string>?>.Failure("Размер не может быть пустым.");
            }

            if (!grid.Contains(size))
            {
                return Result<List<string>?>.Failure($"Размер «{size}» не входит в размерную сетку этого типа товаров.");
            }

            if (!seen.Add(size))
            {
                return Result<List<string>?>.Failure($"Размер «{size}» указан дважды.");
            }
        }

        var ordered = grid.Where(seen.Contains).ToList();
        return Result<List<string>?>.Success(ordered.Count == grid.Count ? null : ordered);
    }
}
