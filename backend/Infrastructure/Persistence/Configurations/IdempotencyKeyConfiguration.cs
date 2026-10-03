using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Domain.Entities;

namespace Infrastructure.Persistence.Configurations;

public class IdempotencyKeyConfiguration : IEntityTypeConfiguration<IdempotencyKey>
{
    public void Configure(EntityTypeBuilder<IdempotencyKey> builder)
    {
        builder.Property(k => k.Key).HasMaxLength(100).IsRequired();
        builder.Property(k => k.RequestHash).HasMaxLength(64).IsRequired();

        builder.HasOne(k => k.User)
            .WithMany()
            .HasForeignKey(k => k.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(k => new { k.UserId, k.Key }).IsUnique();
        builder.HasIndex(k => k.CreatedAt);
    }
}
