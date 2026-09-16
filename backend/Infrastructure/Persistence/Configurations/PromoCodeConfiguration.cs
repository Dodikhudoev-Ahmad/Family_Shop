using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Domain.Entities;

namespace Infrastructure.Persistence.Configurations;

public class PromoCodeConfiguration : IEntityTypeConfiguration<PromoCode>
{
    public void Configure(EntityTypeBuilder<PromoCode> builder)
    {
        builder.Property(p => p.Code).HasMaxLength(50).IsRequired();
        builder.HasIndex(p => p.Code).IsUnique();

        builder.Property(p => p.DiscountValue).HasColumnType("decimal(18,2)");
        builder.Property(p => p.MinOrderAmount).HasColumnType("decimal(18,2)");
        builder.Property(p => p.MaxDiscountAmount).HasColumnType("decimal(18,2)");
    }
}
