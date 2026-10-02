using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;
using Domain.ValueObjects;

namespace Application.Services;

public class AuthService : IAuthService
{
    // One generic message for every way a refresh can fail, so the response never says whether a
    // token was unknown, expired, replayed or bound to another device.
    private const string InvalidRefreshMessage = "Invalid or expired refresh token.";

    // BCrypt-verified when the e-mail is unknown, so "no such user" costs the same as "wrong
    // password" and response time doesn't reveal which addresses are registered.
    private static string? _dummyPasswordHash;
    private static readonly object DummyLock = new();

    private readonly IUnitOfWork _unitOfWork;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        IUnitOfWork unitOfWork,
        IPasswordHasher passwordHasher,
        IJwtTokenGenerator jwtTokenGenerator,
        ILogger<AuthService> logger)
    {
        _unitOfWork = unitOfWork;
        _passwordHasher = passwordHasher;
        _jwtTokenGenerator = jwtTokenGenerator;
        _logger = logger;
    }

    public async Task<Result<AuthResult>> RegisterAsync(RegisterRequestDto request, SessionContext session, CancellationToken cancellationToken = default)
    {
        var existing = await _unitOfWork.Users.GetByEmailAsync(request.Email, cancellationToken);
        if (existing is not null)
        {
            _logger.LogWarning("Registration attempt with already-used email.");
            return Result<AuthResult>.Failure("A user with this email already exists.");
        }

        var user = new User
        {
            Email = new Email(request.Email),
            Name = request.Name,
            PasswordHash = _passwordHasher.Hash(request.Password),
            Role = UserRole.Customer
        };

        await _unitOfWork.Users.AddAsync(user, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<AuthResult>.Success(await StartSessionAsync(user, session, cancellationToken));
    }

    public async Task<Result<AuthResult>> LoginAsync(LoginRequestDto request, SessionContext session, CancellationToken cancellationToken = default)
    {
        var found = await _unitOfWork.Users.GetByEmailAsync(request.Email, cancellationToken);

        // A deleted account is "no such user": its placeholder e-mail must not be usable to sign in.
        var user = found is { IsDeleted: false } ? found : null;

        // Always run one password verification, against a dummy hash if there is no such user.
        var hash = user?.PasswordHash ?? GetDummyHash();
        var passwordOk = _passwordHasher.Verify(request.Password, hash);

        if (user is null || !passwordOk)
        {
            _logger.LogWarning("Failed login attempt for a user.");
            return Result<AuthResult>.Failure("Invalid email or password.");
        }

        return Result<AuthResult>.Success(await StartSessionAsync(user, session, cancellationToken));
    }

    public async Task<Result<AuthResult>> RefreshAsync(string refreshToken, SessionContext session, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var existing = await _unitOfWork.RefreshTokens.GetByTokenHashAsync(TokenHasher.Hash(refreshToken), cancellationToken);

        if (existing is null || existing.User is null)
        {
            _logger.LogWarning("Refresh attempt with an unknown token.");
            return Fail();
        }

        // The token's own type (set by the server at login) must match the endpoint it is used on:
        // a web cookie token is useless on the mobile endpoint and vice versa. A mismatch means the
        // token left the place it was issued for, so the whole session is burned.
        if (existing.ClientType != session.Type)
        {
            await RevokeFamilyAsync(existing, now, "used on the wrong client type", cancellationToken);
            return Fail();
        }

        if (existing.RotatedAt is not null)
        {
            // Replay of an already-used token. Within a few seconds that is two tabs racing, which just
            // fails; later it means someone holds a copy of an old token, so every token derived from
            // that login - including the successor the thief may already have - is revoked.
            if (now - existing.RotatedAt.Value > SessionPolicy.RotationReuseGrace)
            {
                await RevokeFamilyAsync(existing, now, "rotated token was reused", cancellationToken);
            }

            return Fail();
        }

        if (existing.RevokedAt is not null || now >= existing.ExpiresAt || now >= existing.AbsoluteExpiresAt)
        {
            return Fail();
        }

        if (existing.ClientType == ClientType.Mobile && !DeviceMatches(existing, session))
        {
            // Right token, wrong (or missing) device: it was copied off the device it belongs to.
            await RevokeFamilyAsync(existing, now, "device mismatch", cancellationToken);
            return Fail();
        }

        // Exactly one concurrent caller gets to rotate; the rest fail without touching the session.
        if (!await _unitOfWork.RefreshTokens.TryMarkRotatedAsync(existing.Id, now, cancellationToken))
        {
            return Fail();
        }

        existing.RotatedAt = now;
        var next = await IssueTokenAsync(existing.User, existing.FamilyId, existing.ClientType, existing.DeviceIdHash,
            existing.DeviceName, existing.AbsoluteExpiresAt, now, cancellationToken);
        return Result<AuthResult>.Success(next);
    }

    public async Task RevokeRefreshTokenAsync(string refreshToken, SessionContext session, CancellationToken cancellationToken = default)
    {
        var existing = await _unitOfWork.RefreshTokens.GetByTokenHashAsync(TokenHasher.Hash(refreshToken), cancellationToken);
        if (existing is null || existing.ClientType != session.Type)
        {
            return;
        }

        if (existing.ClientType == ClientType.Mobile && !DeviceMatches(existing, session))
        {
            return;
        }

        // Logout ends the whole session (the family), not just the token in hand.
        await _unitOfWork.RefreshTokens.RevokeFamilyAsync(existing.FamilyId, DateTime.UtcNow, cancellationToken);
    }

    public async Task<int> LogoutAllAsync(int userId, CancellationToken cancellationToken = default)
    {
        var revoked = await _unitOfWork.RefreshTokens.RevokeAllForUserAsync(userId, DateTime.UtcNow, cancellationToken);
        _logger.LogInformation("Revoked all sessions for user {UserId} ({Count} tokens).", userId, revoked);
        return revoked;
    }

    public async Task<DeleteAccountOutcome> DeleteAccountAsync(int userId, string password, CancellationToken cancellationToken = default)
    {
        var user = await _unitOfWork.Users.GetByIdAsync(userId, cancellationToken);
        if (user is null || user.IsDeleted)
        {
            return DeleteAccountOutcome.NotFound;
        }

        // The administrator account is the way into the back office; it is removed by hand, never from the app.
        if (user.Role == UserRole.Admin)
        {
            _logger.LogWarning("Account deletion refused for administrator {UserId}.", userId);
            return DeleteAccountOutcome.NotAllowed;
        }

        if (!_passwordHasher.Verify(password, user.PasswordHash))
        {
            _logger.LogWarning("Account deletion refused for user {UserId}: wrong password.", userId);
            return DeleteAccountOutcome.InvalidPassword;
        }

        var now = DateTime.UtcNow;
        // One transaction: either the account is anonymised, its orders detached and every session gone, or nothing changed.
        var done = await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            await _unitOfWork.RefreshTokens.RevokeAllForUserAsync(userId, now, ct);
            await _unitOfWork.RefreshTokens.DeleteAllForUserAsync(userId, ct);
            await _unitOfWork.Orders.AnonymizeContactDataForUserAsync(userId, ct);
            user.Anonymize(now);
            await _unitOfWork.SaveChangesAsync(ct);
            return true;
        }, cancellationToken);

        if (!done)
        {
            return DeleteAccountOutcome.NotFound;
        }

        // Reviews and order lines stay as they are: they point at the (now anonymous) row, which still exists.
        _logger.LogInformation("Account {UserId} deleted by its owner.", userId);
        return DeleteAccountOutcome.Deleted;
    }

    public async Task<IReadOnlyList<SessionDto>> GetSessionsAsync(int userId, Guid? currentSessionId, CancellationToken cancellationToken = default)
    {
        var sessions = await _unitOfWork.RefreshTokens.GetActiveSessionsAsync(userId, DateTime.UtcNow, cancellationToken);
        return sessions
            .Select(t => new SessionDto(
                t.FamilyId,
                t.ClientType.ToString(),
                t.DeviceName,
                t.CreatedAt,
                t.LastUsedAt ?? t.CreatedAt,
                currentSessionId == t.FamilyId))
            .ToList();
    }

    public async Task<Result<bool>> RevokeSessionAsync(int userId, Guid sessionId, CancellationToken cancellationToken = default)
    {
        var revoked = await _unitOfWork.RefreshTokens.RevokeFamilyForUserAsync(userId, sessionId, DateTime.UtcNow, cancellationToken);
        return revoked > 0 ? Result<bool>.Success(true) : Result<bool>.Failure("Session not found.");
    }

    // ---- internals ----

    private static Result<AuthResult> Fail() => Result<AuthResult>.Failure(InvalidRefreshMessage);

    private async Task RevokeFamilyAsync(RefreshToken token, DateTime now, string reason, CancellationToken cancellationToken)
    {
        await _unitOfWork.RefreshTokens.RevokeFamilyAsync(token.FamilyId, now, cancellationToken);
        // No token, token hash or device id is ever written to the log - only ids.
        _logger.LogWarning("Session {FamilyId} of user {UserId} revoked: {Reason}.", token.FamilyId, token.UserId, reason);
    }

    private static bool DeviceMatches(RefreshToken token, SessionContext session)
    {
        if (string.IsNullOrEmpty(session.DeviceId) || string.IsNullOrEmpty(token.DeviceIdHash))
        {
            return false;
        }

        var presented = Encoding.ASCII.GetBytes(TokenHasher.Hash(session.DeviceId));
        var stored = Encoding.ASCII.GetBytes(token.DeviceIdHash);
        return CryptographicOperations.FixedTimeEquals(presented, stored);
    }

    private string GetDummyHash()
    {
        if (_dummyPasswordHash is null)
        {
            lock (DummyLock)
            {
                _dummyPasswordHash ??= _passwordHasher.Hash(Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)));
            }
        }

        return _dummyPasswordHash;
    }

    /// <summary>Begins a brand-new session (new family) at login/registration.</summary>
    private async Task<AuthResult> StartSessionAsync(User user, SessionContext session, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var repo = _unitOfWork.RefreshTokens;

        string? deviceHash = null;
        if (session.Type == ClientType.Mobile)
        {
            deviceHash = TokenHasher.Hash(session.DeviceId ?? string.Empty);

            // One session per physical device: logging in again on the same phone replaces the old one.
            var sameDevice = (await repo.GetActiveSessionsAsync(user.Id, now, cancellationToken))
                .Where(t => t.ClientType == ClientType.Mobile && t.DeviceIdHash == deviceHash)
                .Select(t => t.FamilyId)
                .Distinct()
                .ToList();
            foreach (var family in sameDevice)
            {
                await repo.RevokeFamilyAsync(family, now, cancellationToken);
            }
        }

        // Keep the number of live sessions bounded: past the cap the least recently used ones go.
        var live = (await repo.GetActiveSessionsAsync(user.Id, now, cancellationToken))
            .Where(t => t.ClientType == session.Type)
            .ToList();
        foreach (var stale in live.Skip(SessionPolicy.MaxSessionsPerUser - 1))
        {
            await repo.RevokeFamilyAsync(stale.FamilyId, now, cancellationToken);
        }

        // Cheap housekeeping so the table doesn't grow without bound.
        await repo.DeleteDeadTokensAsync(now - SessionPolicy.DeadTokenRetention, cancellationToken);

        return await IssueTokenAsync(
            user,
            Guid.NewGuid(),
            session.Type,
            deviceHash,
            Truncate(session.DeviceName, 100),
            now + SessionPolicy.AbsoluteLifetime(session.Type),
            now,
            cancellationToken);
    }

    private async Task<AuthResult> IssueTokenAsync(
        User user,
        Guid familyId,
        ClientType clientType,
        string? deviceIdHash,
        string? deviceName,
        DateTime absoluteExpiresAt,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var accessToken = _jwtTokenGenerator.GenerateAccessToken(user, familyId);
        var refreshToken = _jwtTokenGenerator.GenerateRefreshToken();

        // Idle lifetime restarts on each rotation, but never runs past the session's hard cap.
        var idleExpiry = now + SessionPolicy.IdleLifetime(clientType);
        var expiresAt = idleExpiry < absoluteExpiresAt ? idleExpiry : absoluteExpiresAt;

        await _unitOfWork.RefreshTokens.AddAsync(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = TokenHasher.Hash(refreshToken),
            FamilyId = familyId,
            ClientType = clientType,
            DeviceIdHash = deviceIdHash,
            DeviceName = deviceName,
            CreatedAt = now,
            LastUsedAt = now,
            ExpiresAt = expiresAt,
            AbsoluteExpiresAt = absoluteExpiresAt
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var response = new AuthResponseDto(user.Id, user.Email.Value, user.Name, user.Role.ToString(), accessToken);
        return new AuthResult(response, refreshToken, expiresAt)
        {
            AccessTokenLifetimeSeconds = _jwtTokenGenerator.AccessTokenLifetimeSeconds
        };
    }

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}
