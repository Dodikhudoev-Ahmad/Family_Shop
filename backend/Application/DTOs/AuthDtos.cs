using System.Text;

namespace Application.DTOs;

// Records print every member from ToString(); anything that holds a secret overrides PrintMembers so
// an accidental `logger.LogInformation("{Request}", request)` can never write a password or token.

public record RegisterRequestDto(string Email, string Password, string Name)
{
    protected virtual bool PrintMembers(StringBuilder builder)
    {
        builder.Append($"Email = {Email}, Password = ***, Name = {Name}");
        return true;
    }
}

public record LoginRequestDto(string Email, string Password)
{
    protected virtual bool PrintMembers(StringBuilder builder)
    {
        builder.Append($"Email = {Email}, Password = ***");
        return true;
    }
}

public record AuthResponseDto(int UserId, string Email, string Name, string Role, string AccessToken)
{
    protected virtual bool PrintMembers(StringBuilder builder)
    {
        builder.Append($"UserId = {UserId}, Email = {Email}, Name = {Name}, Role = {Role}, AccessToken = ***");
        return true;
    }
}

public record AuthResult(AuthResponseDto Response, string RefreshToken, DateTime RefreshTokenExpiresAt)
{
    public int AccessTokenLifetimeSeconds { get; init; }

    protected virtual bool PrintMembers(StringBuilder builder)
    {
        builder.Append($"Response = {Response}, RefreshToken = ***, RefreshTokenExpiresAt = {RefreshTokenExpiresAt:O}");
        return true;
    }
}

// ---- Mobile: the refresh token travels in the JSON body (there is no cookie jar), bound to a device. ----

/// <summary>DeviceId is a random UUID the app generates once and keeps in the Keychain/Keystore; the server stores only its hash.</summary>
public record MobileRegisterRequestDto(string Email, string Password, string Name, string DeviceId, string? DeviceName)
{
    protected virtual bool PrintMembers(StringBuilder builder)
    {
        builder.Append($"Email = {Email}, Password = ***, Name = {Name}, DeviceId = ***, DeviceName = {DeviceName}");
        return true;
    }
}

public record MobileLoginRequestDto(string Email, string Password, string DeviceId, string? DeviceName)
{
    protected virtual bool PrintMembers(StringBuilder builder)
    {
        builder.Append($"Email = {Email}, Password = ***, DeviceId = ***, DeviceName = {DeviceName}");
        return true;
    }
}

public record MobileRefreshRequestDto(string RefreshToken, string DeviceId)
{
    protected virtual bool PrintMembers(StringBuilder builder)
    {
        builder.Append("RefreshToken = ***, DeviceId = ***");
        return true;
    }
}

public record MobileLogoutRequestDto(string RefreshToken, string DeviceId)
{
    protected virtual bool PrintMembers(StringBuilder builder)
    {
        builder.Append("RefreshToken = ***, DeviceId = ***");
        return true;
    }
}

public record MobileAuthResponseDto(
    int UserId,
    string Email,
    string Name,
    string Role,
    string AccessToken,
    int AccessTokenExpiresInSeconds,
    string RefreshToken,
    DateTime RefreshTokenExpiresAt)
{
    protected virtual bool PrintMembers(StringBuilder builder)
    {
        builder.Append($"UserId = {UserId}, Email = {Email}, Role = {Role}, AccessToken = ***, RefreshToken = ***");
        return true;
    }
}

// ---- Session management ("my devices") ----

/// <summary>SessionId is the session family id: stable across rotations, safe to show and to pass back to revoke it.</summary>
public record SessionDto(Guid SessionId, string ClientType, string? DeviceName, DateTime CreatedAt, DateTime LastUsedAt, bool IsCurrent);
