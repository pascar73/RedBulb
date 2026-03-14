// Simplified RapidRAW shader for MVP - 7 basic adjustments
// Full shader available at shader-full.wgsl

struct Adjustments {
    exposure: f32,
    contrast: f32,
    highlights: f32,
    shadows: f32,
    whites: f32,
    blacks: f32,
    brightness: f32,
    _pad: f32,  // Ensure 16-byte alignment
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> adjustments: Adjustments;

const LUMA_COEFF = vec3<f32>(0.2126, 0.7152, 0.0722);

fn get_luma(c: vec3<f32>) -> f32 {
    return dot(c, LUMA_COEFF);
}

fn srgb_to_linear(c: vec3<f32>) -> vec3<f32> {
    let cutoff = vec3<f32>(0.04045);
    let a = vec3<f32>(0.055);
    let higher = pow((c + a) / (1.0 + a), vec3<f32>(2.4));
    let lower = c / 12.92;
    return select(higher, lower, c <= cutoff);
}

fn linear_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let c_clamped = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
    let cutoff = vec3<f32>(0.0031308);
    let a = vec3<f32>(0.055);
    let higher = (1.0 + a) * pow(c_clamped, vec3<f32>(1.0 / 2.4)) - a;
    let lower = c_clamped * 12.92;
    return select(higher, lower, c_clamped <= cutoff);
}

fn apply_exposure(color: vec3<f32>, exposure: f32) -> vec3<f32> {
    return color * pow(2.0, exposure);
}

fn apply_brightness(color: vec3<f32>, brightness: f32) -> vec3<f32> {
    return color + vec3<f32>(brightness * 0.1);
}

fn apply_contrast(color: vec3<f32>, contrast: f32) -> vec3<f32> {
    let midpoint = vec3<f32>(0.5);
    let factor = 1.0 + (contrast * 0.01);
    return (color - midpoint) * factor + midpoint;
}

fn apply_highlights_shadows(color: vec3<f32>, highlights: f32, shadows: f32) -> vec3<f32> {
    let luma = get_luma(color);
    
    // Highlights affect bright areas (luma > 0.5)
    let highlight_mask = smoothstep(0.5, 1.0, luma);
    let highlight_adjust = highlights * -0.01 * highlight_mask;
    
    // Shadows affect dark areas (luma < 0.5)
    let shadow_mask = smoothstep(0.5, 0.0, luma);
    let shadow_adjust = shadows * 0.01 * shadow_mask;
    
    return color * (1.0 + highlight_adjust + shadow_adjust);
}

fn apply_whites_blacks(color: vec3<f32>, whites: f32, blacks: f32) -> vec3<f32> {
    let luma = get_luma(color);
    
    // Whites affect very bright areas (luma > 0.7)
    let white_mask = smoothstep(0.7, 1.0, luma);
    let white_adjust = whites * 0.01 * white_mask;
    
    // Blacks affect very dark areas (luma < 0.3)
    let black_mask = smoothstep(0.3, 0.0, luma);
    let black_adjust = blacks * -0.01 * black_mask;
    
    return color * (1.0 + white_adjust + black_adjust);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let dims = textureDimensions(output_texture);
    if (id.x >= dims.x || id.y >= dims.y) {
        return;
    }
    
    // Load input pixel (already in sRGB from texture)
    var color = textureLoad(input_texture, id.xy, 0).rgb;
    
    // Convert to linear for processing
    color = srgb_to_linear(color);
    
    // Apply adjustments in order
    color = apply_exposure(color, adjustments.exposure);
    color = apply_brightness(color, adjustments.brightness);
    color = apply_contrast(color, adjustments.contrast);
    color = apply_highlights_shadows(color, adjustments.highlights, adjustments.shadows);
    color = apply_whites_blacks(color, adjustments.whites, adjustments.blacks);
    
    // Convert back to sRGB
    color = linear_to_srgb(color);
    
    // Write output
    textureStore(output_texture, id.xy, vec4<f32>(color, 1.0));
}
