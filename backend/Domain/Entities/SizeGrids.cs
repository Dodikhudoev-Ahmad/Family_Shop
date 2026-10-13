namespace Domain.Entities;

/// <summary>The size grid a product can be sold in, by what the product is (not by the category it sits in: shoes and
/// bags live in Женское/Мужское/Детское next to clothes). Mirrors <c>sizesFor</c> of the website and the mobile app.</summary>
public static class SizeGrids
{
    public static readonly IReadOnlyList<string> Clothing = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];

    /// <summary>European shoe sizes per segment, declared once. Teen and kids overlap at 37 on purpose: it is the same
    /// size, offered by both grids.</summary>
    public static readonly IReadOnlyDictionary<ShoeSegment, IReadOnlyList<string>> ShoesBySegment =
        new Dictionary<ShoeSegment, IReadOnlyList<string>>
        {
            [ShoeSegment.Men] = Range(39, 45),
            [ShoeSegment.Women] = Range(35, 41),
            [ShoeSegment.Kids] = Range(27, 37),
            [ShoeSegment.Teen] = Range(37, 41)
        };

    private static readonly HashSet<string> ShoeTypes = ["Ботинки", "Кроссовки"];

    // Bags come in one size; they sit in the gender categories, so they must not inherit the clothing grid.
    private static readonly HashSet<string> SizelessTypes = ["Сумки", "Рюкзаки"];

    private static IReadOnlyList<string> Range(int from, int to) =>
        Enumerable.Range(from, to - from + 1).Select(n => n.ToString()).ToList();

    /// <summary>Types that never take the clothing grid: shoes have their own, bags have none.</summary>
    public static IReadOnlyList<string> NonClothingTypes { get; } = [.. ShoeTypes, .. SizelessTypes];

    /// <summary>Whether shoes of this type in this category are sold in sizes (and so carry a segment).</summary>
    public static bool IsSizedShoe(Category? category, string? productType) =>
        category is { HasSizes: true } && productType is not null && ShoeTypes.Contains(productType);

    /// <summary>The full grid for a product of this type in this category; empty when the product has no sizes. Shoes
    /// take the grid of their segment, so a shoe without one has none.</summary>
    public static IReadOnlyList<string> For(Category? category, string? productType, ShoeSegment? shoeSegment = null)
    {
        if (category is null || !category.HasSizes)
        {
            return [];
        }

        if (IsSizedShoe(category, productType))
        {
            return shoeSegment is { } segment ? ShoesBySegment[segment] : [];
        }

        if (productType is not null && SizelessTypes.Contains(productType))
        {
            return [];
        }

        return Clothing;
    }

    /// <summary>The sizes a customer can actually pick: the admin's selection, or the whole grid when none was made.</summary>
    public static IReadOnlyList<string> Effective(Product product, Category? category)
    {
        var grid = For(category, product.ProductType, product.ShoeSegment);
        return product.AvailableSizes is null ? grid : product.AvailableSizes.Where(grid.Contains).ToList();
    }
}
