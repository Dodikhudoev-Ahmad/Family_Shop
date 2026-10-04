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
        Assert.Equal(39, all.Count); // 13 original + 8 "extra" + 13 kids + 5 more men's sneakers
        Assert.Contains(male, p => ProductTypeClassifier.Infer(p.Name) == "Кроссовки");
        Assert.Contains(female, p => ProductTypeClassifier.Infer(p.Name) == "Сумки");
    }

    [Fact]
    public void KidsShoesAndBags_HaveExplicitTypesAndPhotosAndNoDuplicates()
    {
        var kids = ShoesAndBagsFor(3, Gender.Kids);

        Assert.Equal(13, kids.Count);
        Assert.All(kids, p => Assert.Contains(p.ProductType, new[] { "Ботинки", "Кроссовки", "Сумки" }));
        Assert.All(kids, p => Assert.StartsWith("https://images.pexels.com/", p.Images[0]));
        Assert.Equal(kids.Count, kids.Select(p => p.Images[0]).Distinct().Count());
        Assert.Equal(kids.Count, kids.Select(p => p.Name).Distinct().Count());
        Assert.Contains(kids, p => p.ProductType == "Ботинки");
        Assert.Contains(kids, p => p.ProductType == "Кроссовки");
        Assert.Contains(kids, p => p.ProductType == "Сумки");
    }

    // The catalog shows a type chip only from MIN_TYPE_ITEMS (5) items, so the seed has to
    // carry at least that many of each shoe/bag type in the categories that should show one.
    [Theory]
    [InlineData(Gender.Male, "Кроссовки")]
    [InlineData(Gender.Kids, "Ботинки")]
    [InlineData(Gender.Kids, "Сумки")]
    [InlineData(Gender.Female, "Ботинки")]
    [InlineData(Gender.Female, "Сумки")]
    public void ShoesAndBags_HaveEnoughItemsPerTypeForATypeChip(Gender gender, string type)
    {
        Assert.True(ShoesAndBagsFor(1, gender).Count(p => p.ProductType == type || ProductTypeClassifier.Infer(p.Name) == type && p.ProductType is null) >= 5);
    }

    [Fact]
    public void ShoesAndBags_NeverReuseAPhotoAcrossProducts()
    {
        var images = new[] { Gender.Male, Gender.Female, Gender.Kids }
            .SelectMany(g => ShoesAndBagsFor(1, g))
            .Select(p => p.Images[0])
            .ToList();
        Assert.Equal(images.Count, images.Distinct().Count());
    }

    [Fact]
    public void RetiredKidsProducts_AreNoLongerSeeded()
    {
        var retired = (string[])typeof(SeedData).GetField("RetiredKidsProducts", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)!;
        var seeded = ShoesAndBagsFor(3, Gender.Kids).Select(p => p.Name).ToHashSet();

        Assert.Equal(5, retired.Length);
        Assert.DoesNotContain(retired, seeded.Contains);
    }
}
