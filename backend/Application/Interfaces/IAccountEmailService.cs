namespace Application.Interfaces;

public enum ConfirmEmailOutcome
{
    Confirmed,
    /// <summary>Unknown, already used or expired token - deliberately one answer for all three.</summary>
    InvalidToken
}

public enum ResetPasswordOutcome
{
    Reset,
    InvalidToken,
    /// <summary>The new password equals the account's e-mail address. The token stays valid.</summary>
    NotAllowed,
    /// <summary>The new password is known from data breaches. The token stays valid.</summary>
    BreachedPassword
}

/// <summary>E-mail address confirmation and password reset by e-mail link.</summary>
public interface IAccountEmailService
{
    /// <summary>Sends the confirmation link to a just-registered user. Never throws: a failure must not break registration.</summary>
    Task SendConfirmationAsync(int userId, string? locale, CancellationToken cancellationToken = default);

    /// <summary>"Send the confirmation again". Answers (and takes) the same whether or not the address belongs to an account.</summary>
    Task RequestConfirmationAsync(string email, string? locale, CancellationToken cancellationToken = default);

    /// <summary>"Forgot password". Answers (and takes) the same whether or not the address belongs to an account.</summary>
    Task RequestPasswordResetAsync(string email, string? locale, CancellationToken cancellationToken = default);

    Task<ConfirmEmailOutcome> ConfirmEmailAsync(string token, CancellationToken cancellationToken = default);

    /// <summary>Sets a new password with a reset token, ends every session (web and mobile) and uses the token up.</summary>
    Task<ResetPasswordOutcome> ResetPasswordAsync(string token, string newPassword, CancellationToken cancellationToken = default);
}
