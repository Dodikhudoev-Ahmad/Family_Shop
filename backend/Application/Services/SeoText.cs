using System.Globalization;
using System.Text;

namespace Application.Services;

/// <summary>The ru title and description templates of docs/Seo.md (section 3), the same as the site's <c>utils/seoText.ts</c>.</summary>
public static class SeoText
{
    public const string SiteName = "Family Shop";
    public const int TitleMax = 60;
    public const int DescriptionMax = 150;

    private const char Nbsp = ' ';

    /// <summary>Whole tenge with thousands grouped by a no-break space and the ₸ sign: «12 500 ₸» (no culture data needed).</summary>
    public static string FormatTenge(decimal amount)
    {
        var digits = Math.Round(amount, 0, MidpointRounding.AwayFromZero).ToString("0", CultureInfo.InvariantCulture);
        var sb = new StringBuilder();
        for (var i = 0; i < digits.Length; i++)
        {
            if (i > 0 && (digits.Length - i) % 3 == 0) sb.Append(Nbsp);
            sb.Append(digits[i]);
        }
        return $"{sb}{Nbsp}₸";
    }

    /// <summary>Whitespace collapsed; longer than <paramref name="max"/> is cut and ends with «…» (total length stays within <paramref name="max"/>).</summary>
    public static string Truncate(string? text, int max)
    {
        var clean = string.Join(' ', (text ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return clean.Length <= max ? clean : clean[..(max - 1)].TrimEnd() + "…";
    }

    /// <summary>«{name} — {price} | Family Shop», the name cut so that the title fits <see cref="TitleMax"/>.</summary>
    public static string ProductTitle(string name, decimal effectivePrice)
    {
        var price = FormatTenge(effectivePrice);
        var overhead = $" — {price} | {SiteName}".Length;
        return $"{Truncate(name, Math.Max(10, TitleMax - overhead))} — {price} | {SiteName}";
    }

    public static string ProductDescription(string name, string? description)
    {
        var text = Truncate(description, DescriptionMax);
        return text.Length > 0 ? text : $"{name} в интернет-магазине {SiteName}. Доставка по Казахстану.";
    }

    public static string CategoryTitle(string name) => $"{name} — купить в Казахстане | {SiteName}";

    public static string CategoryDescription(string name, int count, decimal? minPrice) =>
        count > 0 && minPrice is not null
            ? $"{name}: {count} {GoodsWord(count)} в {SiteName}. Цены от {FormatTenge(minPrice.Value)}, быстрая доставка по Казахстану."
            : $"Каталог «{name}» в интернет-магазине {SiteName}: широкий выбор, актуальные цены и быстрая доставка по Казахстану.";

    /// <summary>Russian plural of «товар» for a count: 1 товар, 2–4 товара, 5–20 товаров, 21 товар...</summary>
    public static string GoodsWord(int count)
    {
        var mod100 = count % 100;
        var mod10 = count % 10;
        if (mod10 == 1 && mod100 != 11) return "товар";
        if (mod10 is >= 2 and <= 4 && mod100 is < 12 or > 14) return "товара";
        return "товаров";
    }
}
