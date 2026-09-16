using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Domain.Entities;

namespace Infrastructure.Persistence.Configurations;

public class PromoBannerConfiguration : IEntityTypeConfiguration<PromoBanner>
{
    public void Configure(EntityTypeBuilder<PromoBanner> builder)
    {
        builder.Property(b => b.Title).HasMaxLength(200).IsRequired();
        builder.Property(b => b.Subtitle).HasMaxLength(500);
        builder.Property(b => b.ButtonText).HasMaxLength(100);
        builder.Property(b => b.ButtonLink).HasMaxLength(500);
        builder.Property(b => b.ImageUrl).HasMaxLength(1000);

        builder.HasIndex(b => new { b.IsActive, b.SortOrder });
    }
}
