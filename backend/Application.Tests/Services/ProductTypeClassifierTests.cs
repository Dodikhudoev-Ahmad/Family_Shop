using Xunit;
using Domain.Entities;

namespace Application.Tests.Services;

public class ProductTypeClassifierTests
{
    [Theory]
    [InlineData("Рубашка классическая белая", "Рубашки")]
    [InlineData("Куртка спортивная жёлтая", "Куртки")]
    [InlineData("Спортивный костюм детский", "Костюмы")]
    [InlineData("Комплект блузка и юбка-карандаш", "Блузки")]
    [InlineData("Кроссовки для бега мужские", "Кроссовки")]
    [InlineData("Чайник для плиты со свистком", "Чайники")]
    [InlineData("Стойка для дисков штанги", "Штанги и диски")]
    [InlineData("Сумка-мешок чёрная", "Сумки")]
    [InlineData("Смарт-часы спортивные чёрные", "Часы")]
    [InlineData("Этажерка для обуви", "Этажерки")]
    [InlineData("Что-то неизвестное", null)]
    [InlineData("", null)]
    public void Infer_MapsNameToType(string name, string? expected)
    {
        Assert.Equal(expected, ProductTypeClassifier.Infer(name));
    }

    [Theory]
    [InlineData("Этажерки")]
    [InlineData("Органайзеры")]
    [InlineData("Системы хранения")]
    [InlineData("Декор")]
    public void KnownTypes_IncludeTheHomeGoodsTypes(string type)
    {
        Assert.Contains(type, ProductTypeClassifier.KnownTypes);
    }

    [Fact]
    public void Infer_ClassifiesEverySeededProductName()
    {
        var names = File.ReadAllLines(Path.Combine(AppContext.BaseDirectory, "seed-names.txt"));
        var unclassified = names.Where(n => ProductTypeClassifier.Infer(n) is null).ToList();
        Assert.Empty(unclassified);
    }
}
