using Xunit;
using Application.Services;

namespace Application.Tests.Seo;

public class SeoTextTests
{
    private const string N = " "; // no-break space

    [Theory]
    [InlineData(0, "0")]
    [InlineData(950, "950")]
    [InlineData(12500, "12" + N + "500")]
    [InlineData(1234567, "1" + N + "234" + N + "567")]
    public void FormatTenge_GroupsThousandsWithANoBreakSpace_AndEndsWithTheSign(int amount, string digits) =>
        Assert.Equal($"{digits}{N}₸", SeoText.FormatTenge(amount));

    [Fact]
    public void FormatTenge_RoundsToWholeTenge_HalfAwayFromZero() =>
        Assert.Equal($"1{N}001{N}₸", SeoText.FormatTenge(1000.5m));

    [Fact]
    public void Truncate_CollapsesWhitespace_AndCutsWithAnEllipsisWithinTheLimit()
    {
        Assert.Equal("a b c", SeoText.Truncate("  a \n b\tc ", 150));
        var cut = SeoText.Truncate(string.Join(' ', Enumerable.Repeat("слово", 60)), 150);
        Assert.True(cut.Length <= 150);
        Assert.EndsWith("…", cut);
        Assert.Equal("", SeoText.Truncate(null, 10));
    }

    [Fact]
    public void ProductTitle_IsNamePricePipeSite()
    {
        Assert.Equal($"Платье летнее — 12{N}500{N}₸ | Family Shop", SeoText.ProductTitle("Платье летнее", 12500));
    }

    [Fact]
    public void ProductTitle_CutsTheNameNotThePriceOrTheSite_AndStaysWithin60()
    {
        var title = SeoText.ProductTitle(string.Concat(Enumerable.Repeat("Очень длинное название ", 8)), 12500);
        Assert.True(title.Length <= SeoText.TitleMax);
        Assert.EndsWith($"… — 12{N}500{N}₸ | Family Shop", title);
    }

    [Fact]
    public void ProductDescription_IsTheCutDescription_OrTheTemplateWhenEmpty()
    {
        Assert.Equal("Лёгкое платье.", SeoText.ProductDescription("Платье", " Лёгкое  платье. "));
        Assert.True(SeoText.ProductDescription("Платье", new string('а', 400)).Length <= SeoText.DescriptionMax);
        Assert.Equal("Платье в интернет-магазине Family Shop. Доставка по Казахстану.", SeoText.ProductDescription("Платье", "   "));
    }

    [Fact]
    public void CategoryTitle_AndDescription_FollowTheTemplates()
    {
        Assert.Equal("Женское — купить в Казахстане | Family Shop", SeoText.CategoryTitle("Женское"));
        Assert.Equal($"Женское: 12 товаров в Family Shop. Цены от 8{N}000{N}₸, быстрая доставка по Казахстану.", SeoText.CategoryDescription("Женское", 12, 8000));
        Assert.Equal("Каталог «Посуда» в интернет-магазине Family Shop: широкий выбор, актуальные цены и быстрая доставка по Казахстану.", SeoText.CategoryDescription("Посуда", 0, null));
    }

    [Theory]
    [InlineData(1, "товар")]
    [InlineData(2, "товара")]
    [InlineData(4, "товара")]
    [InlineData(5, "товаров")]
    [InlineData(11, "товаров")]
    [InlineData(12, "товаров")]
    [InlineData(14, "товаров")]
    [InlineData(21, "товар")]
    [InlineData(22, "товара")]
    [InlineData(25, "товаров")]
    [InlineData(101, "товар")]
    [InlineData(111, "товаров")]
    public void GoodsWord_FollowsRussianPlurals(int count, string expected) => Assert.Equal(expected, SeoText.GoodsWord(count));
}
