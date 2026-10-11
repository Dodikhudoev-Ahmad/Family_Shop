using System.Diagnostics;
using System.Security.Cryptography;
using Microsoft.Extensions.Logging;
using Application.Common;
using Application.Mail;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;

namespace Application.Services;

/// <summary>
/// E-mail address confirmation and password reset by link. The token is 32 random bytes; only its SHA-256 is stored; it works
/// once and for a short time (confirm 24 h, reset 30 min). The "request" calls answer - and take about as long - the same way
/// for an address that has an account and one that has not, and never report a delivery failure.
/// </summary>
public class AccountEmailService : IAccountEmailService
{
    public static readonly TimeSpan ConfirmLifetime = TimeSpan.FromHours(24);
    public static readonly TimeSpan ResetLifetime = TimeSpan.FromMinutes(30);

    /// <summary>Floor for the duration of a "request" call: the extra database writes of a known address (a few ms) vanish
    /// inside it, so response time does not reveal whether an account exists.</summary>
    public static readonly TimeSpan DefaultMinimumResponseTime = TimeSpan.FromMilliseconds(300);

    private static readonly TimeSpan DeadTokenRetention = TimeSpan.FromDays(7);

    private readonly IUnitOfWork _unitOfWork;
    private readonly IEmailSender _sender;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ILoginAttemptTracker _attempts;
    private readonly IEmailRequestThrottle _throttle;
    private readonly SeoSettings _site;
    private readonly ILogger<AccountEmailService> _logger;
    private readonly IBreachedPasswordChecker? _breachedPasswords;
    private readonly TimeSpan _minimumResponseTime;

    public AccountEmailService(
        IUnitOfWork unitOfWork,
        IEmailSender sender,
        IPasswordHasher passwordHasher,
        ILoginAttemptTracker attempts,
        IEmailRequestThrottle throttle,
        SeoSettings site,
        ILogger<AccountEmailService> logger,
        IBreachedPasswordChecker? breachedPasswords = null,
        TimeSpan? minimumResponseTime = null)
    {
        _unitOfWork = unitOfWork;
        _sender = sender;
        _passwordHasher = passwordHasher;
        _attempts = attempts;
        _throttle = throttle;
        _site = site;
        _logger = logger;
        _breachedPasswords = breachedPasswords;
        _minimumResponseTime = minimumResponseTime ?? DefaultMinimumResponseTime;
    }

    public async Task SendConfirmationAsync(int userId, string? locale, CancellationToken cancellationToken = default)
    {
        try
        {
            var user = await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken);
            if (user is { IsDeleted: false, IsEmailConfirmed: false })
            {
                await IssueAndSendAsync(user, EmailTokenPurpose.Confirm, locale, cancellationToken);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Registration has already succeeded: the user can ask for the letter again.
            _logger.LogWarning(ex, "Could not send the confirmation e-mail for user {UserId}.", userId);
        }
    }

    public Task RequestConfirmationAsync(string email, string? locale, CancellationToken cancellationToken = default) =>
        RequestAsync(email, locale, EmailTokenPurpose.Confirm, cancellationToken);

    public Task RequestPasswordResetAsync(string email, string? locale, CancellationToken cancellationToken = default) =>
        RequestAsync(email, locale, EmailTokenPurpose.Reset, cancellationToken);

    private async Task RequestAsync(string email, string? locale, EmailTokenPurpose purpose, CancellationToken cancellationToken)
    {
        var clock = Stopwatch.StartNew();
        try
        {
            string normalized;
            try
            {
                normalized = new Email(email).Value;
            }
            catch (ArgumentException)
            {
                normalized = string.Empty;
            }

            // The budget is spent for every address, known or not, so a refusal looks like any other answer.
            var allowed = normalized.Length > 0 && _throttle.TryAcquire($"{purpose}:{normalized}");
            if (allowed)
            {
                var user = await _unitOfWork.Users.GetByEmailAsync(normalized, cancellationToken);
                var eligible = user is { IsDeleted: false } && (purpose == EmailTokenPurpose.Reset || !user.IsEmailConfirmed);
                if (eligible)
                {
                    await IssueAndSendAsync(user!, purpose, locale, cancellationToken);
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Not reported to the caller: it would tell whether the address is registered.
            _logger.LogWarning(ex, "E-mail request ({Purpose}) failed.", purpose);
        }

        var wait = _minimumResponseTime - clock.Elapsed;
        if (wait > TimeSpan.Zero)
        {
            await Task.Delay(wait, cancellationToken);
        }
    }

    private async Task IssueAndSendAsync(User user, EmailTokenPurpose purpose, string? locale, CancellationToken cancellationToken)
    {
        var token = Base64Url(RandomNumberGenerator.GetBytes(32));
        var now = DateTime.UtcNow;
        var lifetime = purpose == EmailTokenPurpose.Confirm ? ConfirmLifetime : ResetLifetime;

        // A new token replaces the older unused ones of the same kind, so only the latest letter works.
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            await _unitOfWork.EmailTokens.DeleteUnusedAsync(user.Id, purpose, ct);
            await _unitOfWork.EmailTokens.DeleteDeadAsync(now - DeadTokenRetention, ct);
            await _unitOfWork.EmailTokens.AddAsync(new EmailToken
            {
                UserId = user.Id,
                TokenHash = TokenHasher.Hash(token),
                Purpose = purpose,
                CreatedAt = now,
                ExpiresAt = now + lifetime
            }, ct);
            await _unitOfWork.SaveChangesAsync(ct);
            return true;
        }, cancellationToken);

        // The fragment (#) is not sent to any server: the token stays out of access logs and Referer headers.
        var page = purpose == EmailTokenPurpose.Confirm ? "confirm-email" : "reset-password";
        var link = $"{_site.SiteUrl}/{page}#token={token}";
        var message = EmailTemplates.Build(purpose, locale ?? string.Empty, user.Email.Value, user.Name, link);

        try
        {
            await _sender.SendAsync(message, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Could not send the {Purpose} e-mail for user {UserId}.", purpose, user.Id);
        }
    }

    public async Task<ConfirmEmailOutcome> ConfirmEmailAsync(string token, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var row = await _unitOfWork.EmailTokens.GetUsableAsync(TokenHasher.Hash(token), EmailTokenPurpose.Confirm, now, cancellationToken);
        if (row is null)
        {
            return ConfirmEmailOutcome.InvalidToken;
        }

        var user = await _unitOfWork.Users.GetByIdAsync(row.UserId, cancellationToken);
        if (user is null || user.IsDeleted)
        {
            return ConfirmEmailOutcome.InvalidToken;
        }

        var done = await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            // Two requests with the same link: exactly one gets here.
            if (!await _unitOfWork.EmailTokens.TryConsumeAsync(row.Id, now, ct))
            {
                return false;
            }

            user.EmailConfirmedAt ??= now;
            await _unitOfWork.SaveChangesAsync(ct);
            return true;
        }, cancellationToken);

        if (done)
        {
            _logger.LogInformation("E-mail confirmed for user {UserId}.", user.Id);
        }

        return done ? ConfirmEmailOutcome.Confirmed : ConfirmEmailOutcome.InvalidToken;
    }

    public async Task<ResetPasswordOutcome> ResetPasswordAsync(string token, string newPassword, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var row = await _unitOfWork.EmailTokens.GetUsableAsync(TokenHasher.Hash(token), EmailTokenPurpose.Reset, now, cancellationToken);
        if (row is null)
        {
            return ResetPasswordOutcome.InvalidToken;
        }

        var user = await _unitOfWork.Users.GetByIdAsync(row.UserId, cancellationToken);
        if (user is null || user.IsDeleted)
        {
            return ResetPasswordOutcome.InvalidToken;
        }

        // Refused before the token is spent, so the person can pick another password with the same link.
        if (string.Equals(newPassword, user.Email.Value, StringComparison.OrdinalIgnoreCase))
        {
            return ResetPasswordOutcome.NotAllowed;
        }

        if (_breachedPasswords is not null && await _breachedPasswords.IsBreachedAsync(newPassword, cancellationToken))
        {
            return ResetPasswordOutcome.BreachedPassword;
        }

        var newHash = _passwordHasher.Hash(newPassword);

        // One transaction: the token is used up, the password is replaced and every session ends - all or nothing.
        var done = await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            if (!await _unitOfWork.EmailTokens.TryConsumeAsync(row.Id, now, ct))
            {
                return false;
            }

            user.PasswordHash = newHash;
            // The letter reached the mailbox, so the address is proven as well.
            user.EmailConfirmedAt ??= now;
            await _unitOfWork.SaveChangesAsync(ct);
            await _unitOfWork.RefreshTokens.RevokeAllForUserAsync(user.Id, now, ct);
            await _unitOfWork.EmailTokens.DeleteUnusedAsync(user.Id, EmailTokenPurpose.Reset, ct);
            return true;
        }, cancellationToken);

        if (!done)
        {
            return ResetPasswordOutcome.InvalidToken;
        }

        // A pause after wrong passwords must not outlive the reset: the owner has just proven the mailbox.
        _attempts.Reset(user.Email.Value);
        _logger.LogInformation("User {UserId} reset the password by e-mail; all sessions revoked.", user.Id);
        return ResetPasswordOutcome.Reset;
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
