using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Api.Common;
using Application.DTOs;
using Application.Interfaces;

namespace Api.Controllers;

/// <summary>Регистрация, вход и обновление токенов.</summary>
[ApiController]
[Route("api/v1/auth")]
[EnableRateLimiting("auth")]
public class AuthController : ControllerBase
{
    private const string RefreshTokenCookie = "refreshToken";
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    /// <summary>Регистрация нового пользователя.</summary>
    [HttpPost("register")]
    [EnableRateLimiting("auth-register")]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Register(RegisterRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _authService.RegisterAsync(request, cancellationToken);
        if (!result.IsSuccess)
        {
            return Conflict(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Вход по email и паролю.</summary>
    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Login(LoginRequestDto request, CancellationToken cancellationToken)
    {
        var result = await _authService.LoginAsync(request, cancellationToken);
        if (!result.IsSuccess)
        {
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Обновление access-токена по refresh-токену из httpOnly cookie (с ротацией).</summary>
    [HttpPost("refresh")]
    [EnableRateLimiting("auth-refresh")]
    public async Task<ActionResult<ApiResponse<AuthResponseDto>>> Refresh(CancellationToken cancellationToken)
    {
        if (!Request.Cookies.TryGetValue(RefreshTokenCookie, out var refreshToken) || string.IsNullOrEmpty(refreshToken))
        {
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail("Refresh token missing."));
        }

        var result = await _authService.RefreshAsync(refreshToken, cancellationToken);
        if (!result.IsSuccess)
        {
            Response.Cookies.Delete(RefreshTokenCookie);
            return Unauthorized(ApiResponse<AuthResponseDto>.Fail(result.Errors));
        }

        SetRefreshTokenCookie(result.Value!.RefreshToken);
        return Ok(ApiResponse<AuthResponseDto>.Ok(result.Value.Response));
    }

    /// <summary>Выход из аккаунта — инвалидация refresh-токена.</summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (Request.Cookies.TryGetValue(RefreshTokenCookie, out var refreshToken) && !string.IsNullOrEmpty(refreshToken))
        {
            await _authService.RevokeRefreshTokenAsync(refreshToken, cancellationToken);
        }

        Response.Cookies.Delete(RefreshTokenCookie);
        return NoContent();
    }

    private void SetRefreshTokenCookie(string refreshToken)
    {
        Response.Cookies.Append(RefreshTokenCookie, refreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Expires = DateTimeOffset.UtcNow.AddDays(14),
            Path = "/api/v1/auth"
        });
    }
}
