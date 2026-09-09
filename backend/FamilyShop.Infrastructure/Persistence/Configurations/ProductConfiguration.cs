using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using FamilyShop.Domain.Entities;
using FamilyShop.Domain.ValueObjects;

namespace FamilyShop.Infrastructure.Persistence.Configurations;

public class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.Property(p => p.Price)
            .HasConversion(m => m.Amount, v => new Money(v))
            .HasColumnType("decimal(18,2)");

        builder.Property(p => p.DiscountPrice)
            .HasConversion(m => m == null ? (decimal?)null : m.Value.Amount, v => v == null ? (Money?)null : new Money(v.Value))
            .HasColumnType("decimal(18,2)");

        builder.HasOne(p => p.Category)
            .WithMany()
            .HasForeignKey(p => p.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(p => p.CategoryId);
        builder.HasIndex(p => p.Gender);
    }
}
