using Microsoft.AspNetCore.Mvc;
using Api.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;

namespace Api.Controllers;

/// <summary>Публичные промо-баннеры (главная страница, корзина).</summary>
[ApiController]
[Route("api/v1/promo-banners")]
public class PromoBannersController : ControllerBase
{
    private readonly IPromoBannerService _promoBannerService;

    public PromoBannersController(IPromoBannerService promoBannerService)
    {
        _promoBannerService = promoBannerService;
    }

    /// <summary>Активные баннеры для указанного места показа, отсортированные по порядку показа.</summary>
    [HttpGet("active")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<PromoBannerDto>>>> GetActive(
        [FromQuery] PromoBannerPlacement placement,
        CancellationToken cancellationToken)
    {
        var banners = await _promoBannerService.GetActiveBannersAsync(placement, cancellationToken);
        return Ok(ApiResponse<IReadOnlyList<PromoBannerDto>>.Ok(banners));
    }
}
