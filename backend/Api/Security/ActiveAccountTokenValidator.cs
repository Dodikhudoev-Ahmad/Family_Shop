using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Domain.Interfaces;

namespace Api.Security;

/// <summary>
/// A signed access token outlives what it was issued for (15 minutes), so every authenticated request checks
/// two things: the user still exists and has not been deleted, and the session (refresh-token family, claim
/// "sid") is still alive. Logout, sign-out-everywhere, device revoke, admin revoke and account deletion all
/// revoke the family, so the token stops working at once. Two indexed lookups, no cache: a revocation is
/// visible on the very next request. Refresh rotation keeps the family alive, so it is unaffected.
/// </summary>
public static class ActiveAccountTokenValidator
{
    public static async Task ValidateAsync(TokenValidatedContext context)
    {
        var raw = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(raw, out var userId))
        {
            context.Fail("Token has no valid subject.");
            return;
        }

        var sid = context.Principal?.FindFirstValue("sid") ?? context.Principal?.FindFirstValue(ClaimTypes.Sid);
        if (!Guid.TryParse(sid, out var familyId))
        {
            context.Fail("Token has no valid session.");
            return;
        }

        var unitOfWork = context.HttpContext.RequestServices.GetRequiredService<IUnitOfWork>();
        var ct = context.HttpContext.RequestAborted;

        if (!await unitOfWork.Users.IsActiveAsync(userId, ct))
        {
            context.Fail("The account no longer exists.");
            return;
        }

        if (!await unitOfWork.RefreshTokens.IsSessionActiveAsync(userId, familyId, DateTime.UtcNow, ct))
        {
            context.Fail("The session has been revoked.");
        }
    }
}
