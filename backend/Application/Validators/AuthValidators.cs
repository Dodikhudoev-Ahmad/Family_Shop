using System.Text;
using FluentValidation;
using Application.DTOs;

namespace Application.Validators;

/// <summary>Password rules shared by web and mobile registration.</summary>
public static class PasswordRules
{
    /// <summary>bcrypt only looks at the first 72 bytes: anything longer would silently collapse into the
    /// same hash as its 72-byte prefix, so such passwords are refused instead of quietly truncated.</summary>
    public const int MaxBytes = 72;

    private static readonly HashSet<string> Common = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword1",
        "12345678", "123456789", "1234567890", "12345678910", "qwerty123", "qwerty1234", "qwerty12345", "qwertyuiop",
        "1q2w3e4r", "1q2w3e4r5t", "1qaz2wsx", "zaq12wsx", "qazwsx123", "abc12345", "abcd1234", "admin123", "admin1234",
        "welcome1", "welcome123", "letmein123", "iloveyou1", "iloveyou123", "monkey123", "dragon123", "sunshine1",
        "princess1", "football1", "baseball1", "master123", "superman1", "trustno1", "changeme1", "changeme123",
        "kazakhstan1", "almaty123", "astana123", "familyshop1", "familyshop123", "qwe12345", "asdf1234", "zxcvbnm123",
    };

    public static IRuleBuilderOptions<T, string> MustBeAcceptablePassword<T>(this IRuleBuilder<T, string> rule) =>
        rule
            .NotEmpty()
            .MinimumLength(8)
            .Must(p => Encoding.UTF8.GetByteCount(p) <= MaxBytes)
                .WithMessage($"Password must be at most {MaxBytes} bytes long.")
            .Must(p => p.Any(char.IsLetter) && p.Any(char.IsDigit))
                .WithMessage("Password must contain letters and digits.")
            .Must(p => !Common.Contains(p.Trim()))
                .WithMessage("This password is too common - choose another one.");
}

public class RegisterRequestValidator : AbstractValidator<RegisterRequestDto>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).MustBeAcceptablePassword();
        RuleFor(x => x.Password).Must((x, p) => !string.Equals(p, x.Email, StringComparison.OrdinalIgnoreCase))
            .WithMessage("Password must not be the same as the e-mail address.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
    }
}

public class LoginRequestValidator : AbstractValidator<LoginRequestDto>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        // Deliberately no complexity rules on login: it must accept whatever the account already has.
        // The upper bound stops a multi-megabyte "password" from being fed to bcrypt.
        RuleFor(x => x.Password).NotEmpty().MaximumLength(1024);
    }
}

public static class DeviceRules
{
    // A UUID or any random id of 16-128 URL-safe characters.
    public static IRuleBuilderOptions<T, string> MustBeDeviceId<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().Length(16, 128).Matches("^[A-Za-z0-9_-]+$")
            .WithMessage("DeviceId must be 16-128 characters: letters, digits, '-' and '_'.");
}

public class MobileRegisterRequestValidator : AbstractValidator<MobileRegisterRequestDto>
{
    public MobileRegisterRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).MustBeAcceptablePassword();
        RuleFor(x => x.Password).Must((x, p) => !string.Equals(p, x.Email, StringComparison.OrdinalIgnoreCase))
            .WithMessage("Password must not be the same as the e-mail address.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.DeviceId).MustBeDeviceId();
        RuleFor(x => x.DeviceName).MaximumLength(100);
    }
}

public class MobileLoginRequestValidator : AbstractValidator<MobileLoginRequestDto>
{
    public MobileLoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(1024);
        RuleFor(x => x.DeviceId).MustBeDeviceId();
        RuleFor(x => x.DeviceName).MaximumLength(100);
    }
}

public class MobileRefreshRequestValidator : AbstractValidator<MobileRefreshRequestDto>
{
    public MobileRefreshRequestValidator()
    {
        RuleFor(x => x.RefreshToken).NotEmpty().MaximumLength(256);
        RuleFor(x => x.DeviceId).MustBeDeviceId();
    }
}

public class MobileLogoutRequestValidator : AbstractValidator<MobileLogoutRequestDto>
{
    public MobileLogoutRequestValidator()
    {
        RuleFor(x => x.RefreshToken).NotEmpty().MaximumLength(256);
        RuleFor(x => x.DeviceId).MustBeDeviceId();
    }
}

public class DeleteAccountRequestValidator : AbstractValidator<DeleteAccountRequestDto>
{
    public DeleteAccountRequestValidator()
    {
        RuleFor(x => x.Password).NotEmpty().MaximumLength(1024);
    }
}
