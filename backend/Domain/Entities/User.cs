using Domain.ValueObjects;

namespace Domain.Entities;

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

    /// <summary>Set when the owner deleted the account. The row stays (orders and reviews point at it) but holds
    /// no personal data any more - see <see cref="Anonymize"/>.</summary>
    public DateTime? DeletedAt { get; set; }

    public bool IsDeleted => DeletedAt is not null;

    public const string DeletedDisplayName = "Удалённый пользователь";

    /// <summary>Strips every personal field. The e-mail becomes a unique, undeliverable placeholder (so the real
    /// address can be registered again), the password hash a value that no password can ever match.</summary>
    public void Anonymize(DateTime now)
    {
        Email = new Email($"deleted-{Id}@deleted.invalid");
        Name = DeletedDisplayName;
        PasswordHash = "!deleted";
        DeletedAt = now;
    }
}
