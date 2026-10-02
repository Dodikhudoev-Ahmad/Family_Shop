namespace Domain.Entities;

/// <summary>The size grid a product can be sold in, by what the product is (not by the category it sits in: shoes and
/// bags live in Женское/Мужское/Детское next to clothes). Mirrors <c>sizesFor</c> of the website and the mobile app.</summary>
public static class SizeGrids
{
    public static readonly IReadOnlyList<string> Clothing = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];
    public static readonly IReadOnlyList<string> AdultShoes = ["36", "37", "38", "39", "40"];
    public static readonly IReadOnlyList<string> KidsShoes = ["26", "27", "28", "29", "30", "31", "32", "33", "34", "35"];

    private static readonly HashSet<string> ShoeTypes = ["Ботинки", "Кроссовки"];

    // Bags come in one size; they sit in the gender categories, so they must not inherit the clothing grid.
    private static readonly HashSet<string> SizelessTypes = ["Сумки", "Рюкзаки"];

    public const string KidsCategorySlug = "kids";

    /// <summary>The full grid for a product of this type in this category; empty when the product has no sizes.</summary>
    public static IReadOnlyList<string> For(Category? category, string? productType)
    {
        if (category is null || !category.HasSizes)
        {
            return [];
        }

        if (productType is not null && ShoeTypes.Contains(productType))
        {
            return category.Slug == KidsCategorySlug ? KidsShoes : AdultShoes;
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
        var grid = For(category, product.ProductType);
        return product.AvailableSizes is null ? grid : product.AvailableSizes.Where(grid.Contains).ToList();
    }
}
