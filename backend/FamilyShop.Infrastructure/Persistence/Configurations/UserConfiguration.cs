using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using FamilyShop.Domain.Entities;
using FamilyShop.Domain.ValueObjects;

namespace FamilyShop.Infrastructure.Persistence.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.Property(u => u.Email)
            .HasConversion(e => e.Value, v => new Email(v))
            .HasMaxLength(256)
            .HasColumnName("Email");

        builder.HasIndex(u => u.Email).IsUnique();
    }
}
