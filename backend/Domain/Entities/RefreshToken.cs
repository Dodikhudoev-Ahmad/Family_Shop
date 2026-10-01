namespace Domain.Entities;

public enum ClientType
{
    /// <summary>Browser SPA: the refresh token lives in an httpOnly cookie and is never visible to script.</summary>
    Web = 0,

    /// <summary>Native app: the refresh token is returned in the JSON body and kept in the platform keystore.</summary>
    Mobile = 1
}

/// <summary>
/// One refresh token in a session "family": every rotation issues a new row with the same
/// <see cref="FamilyId"/>, so a whole login session (and every token ever derived from it) can be
/// revoked together - which is what makes replay of an already-used token detectable and fatal.
/// The token itself is never stored, only its SHA-256.
/// </summary>
public class RefreshToken
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public string TokenHash { get; set; } = string.Empty;

    /// <summary>Idle expiry: pushed forward on every rotation (never beyond <see cref="AbsoluteExpiresAt"/>).</summary>
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? RevokedAt { get; set; }

    /// <summary>Set when this token was exchanged for its successor. Presenting it again is replay.</summary>
    public DateTime? RotatedAt { get; set; }
    public DateTime? LastUsedAt { get; set; }

    public Guid FamilyId { get; set; } = Guid.NewGuid();
    public ClientType ClientType { get; set; } = ClientType.Web;

    /// <summary>SHA-256 of the device id a mobile session is bound to (null for web).</summary>
    public string? DeviceIdHash { get; set; }

    /// <summary>Human label shown in the user's device list ("Pixel 8"). Display only, never trusted.</summary>
    public string? DeviceName { get; set; }

    /// <summary>Hard cap on a session's life however often it is refreshed.</summary>
    public DateTime AbsoluteExpiresAt { get; set; }

    public bool IsActive => RevokedAt is null && RotatedAt is null
        && DateTime.UtcNow < ExpiresAt && DateTime.UtcNow < AbsoluteExpiresAt;
}
