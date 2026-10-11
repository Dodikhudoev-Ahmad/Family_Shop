namespace Domain.Entities;

public enum EmailTokenPurpose
{
    /// <summary>Proves the owner reads the mailbox (valid 24 h).</summary>
    Confirm = 0,

    /// <summary>Lets the owner choose a new password (valid 30 min).</summary>
    Reset = 1
}

/// <summary>
/// A single-use token sent by e-mail (address confirmation or password reset). The token itself (32 random bytes) is only
/// ever in the e-mail; the database keeps its SHA-256. It works once (<see cref="UsedAt"/>) and until <see cref="ExpiresAt"/>.
/// </summary>
public class EmailToken
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public EmailTokenPurpose Purpose { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
