namespace Infrastructure.Security;

/// <summary>
/// Refuses to start the API with a JWT signing key that would let anyone forge tokens - e.g. the
/// "CHANGE_ME" placeholder committed in appsettings.json when a deploy forgot to override it.
/// A forged token with the Admin role is a full takeover, so this fails closed outside Development.
/// </summary>
public static class JwtSettingsValidator
{
    public const int MinimumKeyBytes = 32;

    public static void Validate(JwtSettings settings, bool isDevelopment)
    {
        if (string.IsNullOrWhiteSpace(settings.Issuer) || string.IsNullOrWhiteSpace(settings.Audience))
        {
            throw new InvalidOperationException("Jwt:Issuer and Jwt:Audience must be configured.");
        }

        var keyBytes = System.Text.Encoding.UTF8.GetByteCount(settings.SecretKey ?? string.Empty);
        if (keyBytes < MinimumKeyBytes)
        {
            throw new InvalidOperationException($"Jwt:SecretKey must be at least {MinimumKeyBytes} bytes long.");
        }

        if (!isDevelopment && settings.SecretKey.Contains("CHANGE_ME", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Jwt:SecretKey is still the placeholder from appsettings.json - set Jwt__SecretKey in the environment.");
        }
    }
}
