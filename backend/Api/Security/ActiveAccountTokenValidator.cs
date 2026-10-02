using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Domain.Interfaces;

namespace Api.Security;

/// <summary>
/// A signed access token outlives the account it was issued for (15 minutes). After an account is deleted the
/// token must stop working at once, so every authenticated request checks that its user still exists and has
/// not been deleted. One primary-key lookup; the rest of the session-revocation latency is a separate, known item (TODO.md).
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

        var users = context.HttpContext.RequestServices.GetRequiredService<IUnitOfWork>().Users;
        if (!await users.IsActiveAsync(userId, context.HttpContext.RequestAborted))
        {
            context.Fail("The account no longer exists.");
        }
    }
}
