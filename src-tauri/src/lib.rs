// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

mod plugins;

#[derive(Serialize, Deserialize, Clone)]
struct ImageMetadata {
    source: String,
    author: String,
    tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ImageReference {
    folder: String,
    image: String,
}

#[derive(Serialize, Deserialize)]
struct MetadataGroups {
    sources: HashMap<String, Vec<ImageReference>>,
    authors: HashMap<String, Vec<ImageReference>>,
    tags: HashMap<String, Vec<ImageReference>>,
}

#[derive(Serialize, Deserialize)]
struct FolderInfo {
    name: String,
    size_mb: f64,
}

#[derive(Serialize, Deserialize)]
struct TagWithCount {
    tag: String,
    count: usize,
}

fn get_folder_size(path: &std::path::Path) -> std::io::Result<u64> {
    let mut total_size = 0u64;
    
    if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                total_size += entry.metadata()?.len();
            } else if path.is_dir() {
                total_size += get_folder_size(&path)?;
            }
        }
    }
    
    Ok(total_size)
}

#[tauri::command]
fn get_image_folders() -> Result<Vec<FolderInfo>, String> {
    use std::fs;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let config_path = home_dir.join(".config").join("waifurary").join("images");

    if !config_path.exists() {
        return Ok(vec![]);
    }

    let mut folders = Vec::new();
    if let Ok(entries) = fs::read_dir(&config_path) {
        for entry in entries {
            if let Ok(entry) = entry {
                if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    if let Some(folder_name) = entry.file_name().to_str() {
                        let folder_path = entry.path();
                        let size_bytes = get_folder_size(&folder_path).unwrap_or(0);
                        let size_mb = size_bytes as f64 / (1024.0 * 1024.0);
                        
                        folders.push(FolderInfo {
                            name: folder_name.to_string(),
                            size_mb,
                        });
                    }
                }
            }
        }
    }

    folders.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(folders)
}

#[tauri::command]
fn get_images_in_folder(folder: &str) -> Result<Vec<String>, String> {
    use std::fs;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let config_path = home_dir.join(".config").join("waifurary").join("images").join(folder);

    if !config_path.exists() {
        return Ok(vec![]);
    }

    let mut images = Vec::new();
    if let Ok(entries) = fs::read_dir(&config_path) {
        for entry in entries {
            if let Ok(entry) = entry {
                if let Some(file_name) = entry.file_name().to_str() {
                    let lower_name = file_name.to_lowercase();
                    if lower_name.ends_with(".png") 
                        || lower_name.ends_with(".jpg") 
                        || lower_name.ends_with(".jpeg")
                        || lower_name.ends_with(".gif")
                        || lower_name.ends_with(".webp")
                        || lower_name.ends_with(".bmp")
                        || lower_name.ends_with(".svg") {
                        images.push(file_name.to_string());
                    }
                }
            }
        }
    }

    images.sort();
    Ok(images)
}

#[tauri::command]
fn get_image_path(folder: &str, image: &str) -> Result<String, String> {
    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let config_path = home_dir.join(".config").join("waifurary").join("images").join(folder).join(image);

    Ok(config_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_image_metadata(folder: &str, image: &str, source: &str, author: &str, tags: Vec<String>) -> Result<(), String> {
    use std::fs;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let metadata_dir = home_dir.join(".config").join("waifurary").join("metadata").join(folder);
    
    fs::create_dir_all(&metadata_dir)
        .map_err(|e| format!("Failed to create metadata directory: {}", e))?;

    let metadata = ImageMetadata {
        source: source.to_string(),
        author: author.to_string(),
        tags,
    };

    let metadata_file = metadata_dir.join(format!("{}.json", image));
    let json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
    
    fs::write(&metadata_file, json)
        .map_err(|e| format!("Failed to write metadata: {}", e))?;

    Ok(())
}

#[tauri::command]
fn load_image_metadata(folder: &str, image: &str) -> Result<Option<ImageMetadata>, String> {
    use std::fs;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let metadata_file = home_dir
        .join(".config")
        .join("waifurary")
        .join("metadata")
        .join(folder)
        .join(format!("{}.json", image));

    if !metadata_file.exists() {
        return Ok(None);
    }

    let json = fs::read_to_string(&metadata_file)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;
    
    // Try to parse metadata with error recovery
    match serde_json::from_str::<ImageMetadata>(&json) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(e) => {
            // Log the error but return empty metadata instead of failing
            eprintln!("Warning: Failed to parse metadata for {}/{}: {}. Using defaults.", folder, image, e);
            Ok(Some(ImageMetadata {
                source: String::new(),
                author: String::new(),
                tags: Vec::new(),
            }))
        }
    }
}

#[tauri::command]
fn get_metadata_groups() -> Result<MetadataGroups, String> {
    use std::fs;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let metadata_base = home_dir.join(".config").join("waifurary").join("metadata");

    let mut sources: HashMap<String, Vec<ImageReference>> = HashMap::new();
    let mut authors: HashMap<String, Vec<ImageReference>> = HashMap::new();
    let mut tags: HashMap<String, Vec<ImageReference>> = HashMap::new();

    if !metadata_base.exists() {
        return Ok(MetadataGroups { sources, authors, tags });
    }

    // Iterate through folders
    if let Ok(folder_entries) = fs::read_dir(&metadata_base) {
        for folder_entry in folder_entries {
            if let Ok(folder_entry) = folder_entry {
                if folder_entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    let folder_name = folder_entry.file_name().to_string_lossy().to_string();
                    
                    // Iterate through metadata files in folder
                    if let Ok(file_entries) = fs::read_dir(folder_entry.path()) {
                        for file_entry in file_entries {
                            if let Ok(file_entry) = file_entry {
                                let file_name = file_entry.file_name().to_string_lossy().to_string();
                                if file_name.ends_with(".json") {
                                    // Read metadata file
                                    if let Ok(json) = fs::read_to_string(file_entry.path()) {
                                        if let Ok(metadata) = serde_json::from_str::<ImageMetadata>(&json) {
                                            let image_name = file_name.trim_end_matches(".json").to_string();
                                            let img_ref = ImageReference {
                                                folder: folder_name.clone(),
                                                image: image_name,
                                            };

                                            // Add to source group
                                            if !metadata.source.is_empty() {
                                                sources.entry(metadata.source.clone())
                                                    .or_insert_with(Vec::new)
                                                    .push(img_ref.clone());
                                            }

                                            // Add to author group
                                            if !metadata.author.is_empty() {
                                                authors.entry(metadata.author.clone())
                                                    .or_insert_with(Vec::new)
                                                    .push(img_ref.clone());
                                            }

                                            // Add to tag groups
                                            for tag in &metadata.tags {
                                                tags.entry(tag.clone())
                                                    .or_insert_with(Vec::new)
                                                    .push(img_ref.clone());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(MetadataGroups { sources, authors, tags })
}

#[tauri::command]
fn get_all_tags() -> Result<Vec<String>, String> {
    use std::fs;
    use std::collections::HashSet;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let metadata_base = home_dir.join(".config").join("waifurary").join("metadata");

    let mut all_tags: HashSet<String> = HashSet::new();

    if !metadata_base.exists() {
        return Ok(Vec::new());
    }

    // Iterate through folders
    if let Ok(folder_entries) = fs::read_dir(&metadata_base) {
        for folder_entry in folder_entries {
            if let Ok(folder_entry) = folder_entry {
                if folder_entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    // Iterate through metadata files in folder
                    if let Ok(file_entries) = fs::read_dir(folder_entry.path()) {
                        for file_entry in file_entries {
                            if let Ok(file_entry) = file_entry {
                                let file_name = file_entry.file_name().to_string_lossy().to_string();
                                if file_name.ends_with(".json") {
                                    // Read metadata file
                                    if let Ok(json) = fs::read_to_string(file_entry.path()) {
                                        if let Ok(metadata) = serde_json::from_str::<ImageMetadata>(&json) {
                                            for tag in metadata.tags {
                                                all_tags.insert(tag);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut sorted_tags: Vec<String> = all_tags.into_iter().collect();
    sorted_tags.sort();
    Ok(sorted_tags)
}

#[tauri::command]
fn get_all_tags_with_count() -> Result<Vec<TagWithCount>, String> {
    use std::fs;
    use std::collections::HashMap;

    let home_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?;
    let metadata_base = home_dir.join(".config").join("waifurary").join("metadata");

    let mut tag_counts: HashMap<String, usize> = HashMap::new();

    if !metadata_base.exists() {
        return Ok(Vec::new());
    }

    // Iterate through folders
    if let Ok(folder_entries) = fs::read_dir(&metadata_base) {
        for folder_entry in folder_entries {
            if let Ok(folder_entry) = folder_entry {
                if folder_entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                    // Iterate through metadata files in folder
                    if let Ok(file_entries) = fs::read_dir(folder_entry.path()) {
                        for file_entry in file_entries {
                            if let Ok(file_entry) = file_entry {
                                let file_name = file_entry.file_name().to_string_lossy().to_string();
                                if file_name.ends_with(".json") {
                                    // Read metadata file
                                    if let Ok(json) = fs::read_to_string(file_entry.path()) {
                                        if let Ok(metadata) = serde_json::from_str::<ImageMetadata>(&json) {
                                            for tag in metadata.tags {
                                                *tag_counts.entry(tag).or_insert(0) += 1;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut result: Vec<TagWithCount> = tag_counts
        .into_iter()
        .map(|(tag, count)| TagWithCount { tag, count })
        .collect();
    
    // Sort by count (descending), then by tag name (ascending)
    result.sort_by(|a, b| {
        b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag))
    });
    
    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_image_folders, 
            get_images_in_folder, 
            get_image_path,
            save_image_metadata,
            load_image_metadata,
            get_metadata_groups,
            get_all_tags,
            get_all_tags_with_count
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
