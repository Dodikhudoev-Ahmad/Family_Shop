namespace Domain.Entities;

public enum PromoCodeDiscountType
{
    Percentage,
    FixedAmount
}

public class PromoCode
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public PromoCodeDiscountType DiscountType { get; set; }
    public decimal DiscountValue { get; set; }
    public decimal? MinOrderAmount { get; set; }
    public decimal? MaxDiscountAmount { get; set; }
    public DateTime ValidFrom { get; set; }
    public DateTime ValidUntil { get; set; }
    public int? UsageLimit { get; set; }
    public int UsageCount { get; set; }
    public bool IsActive { get; set; }
}
