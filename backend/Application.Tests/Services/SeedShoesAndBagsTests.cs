using System.Reflection;
using Domain.Entities;
using Infrastructure.Persistence;
using Xunit;

namespace Application.Tests.Services;

public class SeedShoesAndBagsTests
{
    private static List<Product> ShoesAndBagsFor(int categoryId, Gender gender)
    {
        var method = typeof(SeedData).GetMethod("ShoesAndBagsFor", BindingFlags.NonPublic | BindingFlags.Static)!;
        return ((IEnumerable<Product>)method.Invoke(null, [categoryId, gender])!).ToList();
    }

    [Theory]
    [InlineData(Gender.Male)]
    [InlineData(Gender.Female)]
    [InlineData(Gender.Kids)]
    public void ShoesAndBags_AreAssignedToTheCategoryOfTheirGender(Gender gender)
    {
        var products = ShoesAndBagsFor(42, gender);

        Assert.All(products, p =>
        {
            Assert.Equal(gender, p.Gender);
            Assert.Equal(42, p.CategoryId);
        });
    }

    [Fact]
    public void ShoesAndBags_EveryItemLandsInExactlyOneGenderCategory()
    {
        var male = ShoesAndBagsFor(1, Gender.Male);
        var female = ShoesAndBagsFor(2, Gender.Female);
        var kids = ShoesAndBagsFor(3, Gender.Kids);

        var all = male.Concat(female).Concat(kids).Select(p => p.Name).ToList();
        Assert.Equal(all.Count, all.Distinct().Count());
        Assert.Equal(31, all.Count); // 13 original + 8 "extra" + 10 kids shoes/bags
        Assert.Contains(male, p => ProductTypeClassifier.Infer(p.Name) == "Кроссовки");
        Assert.Contains(female, p => ProductTypeClassifier.Infer(p.Name) == "Сумки");
    }

    [Fact]
    public void KidsShoesAndBags_HaveExplicitTypesAndPhotosAndNoDuplicates()
    {
        var kids = ShoesAndBagsFor(3, Gender.Kids);

        Assert.InRange(kids.Count, 8, 10);
        Assert.All(kids, p => Assert.Contains(p.ProductType, new[] { "Ботинки", "Кроссовки", "Сумки" }));
        Assert.All(kids, p => Assert.StartsWith("https://images.pexels.com/", p.Images[0]));
        Assert.Equal(kids.Count, kids.Select(p => p.Images[0]).Distinct().Count());
        Assert.Equal(kids.Count, kids.Select(p => p.Name).Distinct().Count());
        Assert.Contains(kids, p => p.ProductType == "Ботинки");
        Assert.Contains(kids, p => p.ProductType == "Кроссовки");
        Assert.Contains(kids, p => p.ProductType == "Сумки");
    }
}
