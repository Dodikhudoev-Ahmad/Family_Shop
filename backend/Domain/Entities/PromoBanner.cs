namespace Domain.Entities;

public enum PromoBannerPlacement
{
    Home,
    Cart,
    Both
}

public class PromoBanner
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Subtitle { get; set; }
    public string? ButtonText { get; set; }
    public string? ButtonLink { get; set; }
    public string? ImageUrl { get; set; }
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
    public PromoBannerPlacement Placement { get; set; } = PromoBannerPlacement.Home;
}
