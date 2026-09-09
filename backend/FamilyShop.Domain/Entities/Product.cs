using FamilyShop.Domain.ValueObjects;

namespace FamilyShop.Domain.Entities;

public enum Gender
{
    Male,
    Female,
    Kids
}

public class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public Money Price { get; set; }
    public Money? DiscountPrice { get; set; }
    public int Stock { get; set; }
    public int CategoryId { get; set; }
    public Category? Category { get; set; }
    public Gender Gender { get; set; }
    public List<string> Images { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsBestseller { get; set; }

    // Denormalized from Review rows and recomputed whenever a review is added/removed,
    // so catalog listing/sorting never has to aggregate Reviews per page.
    public decimal AverageRating { get; set; }
    public int ReviewCount { get; set; }

    public Money EffectivePrice => DiscountPrice ?? Price;
}
