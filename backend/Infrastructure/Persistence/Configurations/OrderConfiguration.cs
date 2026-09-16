using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Domain.Entities;
using Domain.ValueObjects;

namespace Infrastructure.Persistence.Configurations;

public class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.Property(o => o.TotalPrice)
            .HasConversion(m => m.Amount, v => new Money(v))
            .HasColumnType("decimal(18,2)");

        builder.Property(o => o.DiscountAmount)
            .HasConversion(m => m.Amount, v => new Money(v))
            .HasColumnType("decimal(18,2)");

        builder.Property(o => o.ContactName).HasMaxLength(200).IsRequired();
        builder.Property(o => o.ContactPhone).HasMaxLength(32).IsRequired();
        builder.Property(o => o.City).HasMaxLength(200);
        builder.Property(o => o.Address).HasMaxLength(500);

        builder.HasOne(o => o.User)
            .WithMany()
            .HasForeignKey(o => o.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(o => o.PromoCode)
            .WithMany()
            .HasForeignKey(o => o.PromoCodeId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(o => o.UserId);
    }
}
