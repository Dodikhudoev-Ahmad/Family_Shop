using Domain.Entities;

namespace Application.Interfaces;

public interface IJwtTokenGenerator
{
    /// <param name="sessionId">The refresh-token family this access token belongs to (the "sid" claim).</param>
    string GenerateAccessToken(User user, Guid sessionId);
    string GenerateRefreshToken();
    int AccessTokenLifetimeSeconds { get; }
}
