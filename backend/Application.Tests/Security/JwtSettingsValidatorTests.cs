using Infrastructure.Security;
using Xunit;

namespace Application.Tests.Security;

public class JwtSettingsValidatorTests
{
    private static JwtSettings Valid(string key) => new() { SecretKey = key, Issuer = "i", Audience = "a" };

    [Fact]
    public void AStrongRandomKey_IsAccepted_InProduction()
    {
        JwtSettingsValidator.Validate(Valid(Convert.ToBase64String(new byte[48])), isDevelopment: false);
    }

    [Theory]
    [InlineData("")]
    [InlineData("short")]
    [InlineData("0123456789012345678901234567890")] // 31 bytes
    public void ATooShortKey_IsRejected_EverywhereIncludingDevelopment(string key)
    {
        Assert.Throws<InvalidOperationException>(() => JwtSettingsValidator.Validate(Valid(key), isDevelopment: true));
        Assert.Throws<InvalidOperationException>(() => JwtSettingsValidator.Validate(Valid(key), isDevelopment: false));
    }

    [Fact]
    public void ThePlaceholderFromAppsettings_IsRejected_InProduction_ButAllowedForLocalDevelopment()
    {
        const string placeholder = "CHANGE_ME_replace_with_a_generated_secret_min_32_chars";
        Assert.Throws<InvalidOperationException>(() => JwtSettingsValidator.Validate(Valid(placeholder), isDevelopment: false));
        JwtSettingsValidator.Validate(Valid(placeholder), isDevelopment: true);
    }

    [Fact]
    public void MissingIssuerOrAudience_IsRejected()
    {
        var key = Convert.ToBase64String(new byte[48]);
        Assert.Throws<InvalidOperationException>(() => JwtSettingsValidator.Validate(new JwtSettings { SecretKey = key, Issuer = "", Audience = "a" }, false));
        Assert.Throws<InvalidOperationException>(() => JwtSettingsValidator.Validate(new JwtSettings { SecretKey = key, Issuer = "i", Audience = " " }, false));
    }
}
