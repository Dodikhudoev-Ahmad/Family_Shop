using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Api.Common;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Действия администратора над учётными записями.</summary>
[ApiController]
[Route("api/v1/admin/users")]
[Authorize(Roles = "Admin")]
public class AdminUsersController : ControllerBase
{
    private readonly IAuthService _authService;

    public AdminUsersController(IAuthService authService)
    {
        _authService = authService;
    }

    /// <summary>Принудительно разлогинить пользователя на всех устройствах (например, при подозрении на кражу токена).</summary>
    [HttpPost("{userId:int}/revoke-sessions")]
    public async Task<ActionResult<ApiResponse<int>>> RevokeSessions(int userId, CancellationToken cancellationToken)
    {
        var revoked = await _authService.LogoutAllAsync(userId, cancellationToken);
        return Ok(ApiResponse<int>.Ok(revoked));
    }
}
