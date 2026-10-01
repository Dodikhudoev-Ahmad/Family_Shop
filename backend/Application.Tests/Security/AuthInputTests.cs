using Xunit;
using Application.DTOs;
using Application.Validators;

namespace Application.Tests.Security;

public class PasswordPolicyTests
{
    private readonly RegisterRequestValidator _validator = new();

    private bool Accepts(string password, string email = "user@example.com") =>
        _validator.Validate(new RegisterRequestDto(email, password, "User")).IsValid;

    [Theory]
    [InlineData("REDACTED")]
    [InlineData("пароль2024долгий")]      // Cyrillic letters count as letters
    [InlineData("қазақпарол2024")]        // so do Kazakh-specific ones
    public void AcceptsReasonablePasswords(string password) => Assert.True(Accepts(password));

    [Theory]
    [InlineData("short1")]                // too short
    [InlineData("onlylettersnodigits")]   // no digit
    [InlineData("1234567890123")]         // no letter
    [InlineData("Password123")]           // on the common list
    [InlineData("QWERTY123")]             // case-insensitive match
    [InlineData("12345678")]
    public void RejectsWeakPasswords(string password) => Assert.False(Accepts(password));

    [Fact]
    public void RejectsAPasswordLongerThanBcryptCanActuallyUse_InsteadOfSilentlyTruncatingIt()
    {
        var seventyTwo = new string('a', 70) + "12";
        Assert.True(Accepts(seventyTwo));
        Assert.False(Accepts(seventyTwo + "x")); // 73 bytes
        Assert.False(Accepts(new string('ж', 40) + "1")); // 81 UTF-8 bytes in 41 characters
    }

    [Fact]
    public void RejectsAPasswordEqualToTheEmail() =>
        Assert.False(Accepts("someone12@example.com", email: "someone12@example.com"));

    [Fact]
    public void LoginDoesNotApplyComplexityRules_ButBoundsTheInput()
    {
        var login = new LoginRequestValidator();
        Assert.True(login.Validate(new LoginRequestDto("user@example.com", "old-weak")).IsValid);
        Assert.False(login.Validate(new LoginRequestDto("user@example.com", new string('x', 5000))).IsValid);
    }

    [Fact]
    public void EmailLongerThanTheColumn_IsRejectedUpFront()
    {
        var longEmail = new string('a', 250) + "@example.com";
        Assert.False(Accepts("REDACTED", longEmail));
    }
}

public class MobileInputTests
{
    private const string GoodDevice = "11111111-2222-3333-4444-555555555555";

    [Theory]
    [InlineData(GoodDevice, true)]
    [InlineData("0123456789abcdef", true)]
    [InlineData("short", false)]
    [InlineData("", false)]
    [InlineData("has spaces in the device id!!", false)]
    [InlineData("<script>alert(1)</script>0000", false)]
    public void DeviceId_MustBeAUrlSafeIdOfSensibleLength(string deviceId, bool valid)
    {
        var result = new MobileRefreshRequestValidator().Validate(new MobileRefreshRequestDto("some-refresh-token", deviceId));
        Assert.Equal(valid, result.IsValid);
    }

    [Fact]
    public void MobileLogin_RequiresADevice()
    {
        Assert.False(new MobileLoginRequestValidator().Validate(new MobileLoginRequestDto("a@b.kz", "pw", "", null)).IsValid);
        Assert.True(new MobileLoginRequestValidator().Validate(new MobileLoginRequestDto("a@b.kz", "pw", GoodDevice, "Pixel")).IsValid);
    }

    [Fact]
    public void MobileRegister_AppliesTheSamePasswordPolicyAsWeb()
    {
        Assert.False(new MobileRegisterRequestValidator().Validate(new MobileRegisterRequestDto("a@b.kz", "Password123", "A", GoodDevice, null)).IsValid);
        Assert.True(new MobileRegisterRequestValidator().Validate(new MobileRegisterRequestDto("a@b.kz", "REDACTED", "A", GoodDevice, null)).IsValid);
    }
}

public class SecretRedactionTests
{
    [Fact]
    public void Dtos_CarryingSecrets_NeverPrintThem()
    {
        // `logger.LogInformation("{Req}", request)` or an exception message that stringifies a record
        // would otherwise write passwords and tokens into the logs.
        var texts = new object[]
        {
            new LoginRequestDto("a@b.kz", "hunter2-secret"),
            new RegisterRequestDto("a@b.kz", "hunter2-secret", "A"),
            new MobileLoginRequestDto("a@b.kz", "hunter2-secret", "device-id-1234567890", "Pixel"),
            new MobileRegisterRequestDto("a@b.kz", "hunter2-secret", "A", "device-id-1234567890", null),
            new MobileRefreshRequestDto("refresh-secret-value", "device-id-1234567890"),
            new MobileLogoutRequestDto("refresh-secret-value", "device-id-1234567890"),
            new AuthResponseDto(1, "a@b.kz", "A", "Customer", "access-secret-jwt"),
            new AuthResult(new AuthResponseDto(1, "a@b.kz", "A", "Customer", "access-secret-jwt"), "refresh-secret-value", DateTime.UtcNow),
            new MobileAuthResponseDto(1, "a@b.kz", "A", "Customer", "access-secret-jwt", 900, "refresh-secret-value", DateTime.UtcNow),
        }.Select(o => o.ToString()!).ToList();

        foreach (var text in texts)
        {
            Assert.DoesNotContain("hunter2-secret", text);
            Assert.DoesNotContain("refresh-secret-value", text);
            Assert.DoesNotContain("access-secret-jwt", text);
            Assert.DoesNotContain("device-id-1234567890", text);
        }
    }
}
