using FamilyShop.Domain.ValueObjects;

namespace FamilyShop.Domain.Entities;

public enum UserRole
{
    Customer,
    Admin
}

public class User
{
    public int Id { get; set; }
    public Email Email { get; set; }
    public string PasswordHash { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.Customer;
}
