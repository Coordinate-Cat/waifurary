import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import "./App.css";

interface ImageMetadata {
  source: string;
  author: string;
  tags: string[];
}

interface TagWithCount {
  tag: string;
  count: number;
}

interface ImageReference {
  folder: string;
  image: string;
}

interface MetadataGroups {
  sources: Record<string, ImageReference[]>;
  authors: Record<string, ImageReference[]>;
  tags: Record<string, ImageReference[]>;
}

interface FolderInfo {
  name: string;
  size_mb: number;
}

function App() {
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [images, setImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string>("");
  const [imagePath, setImagePath] = useState<string>("");
  const [zoom, setZoom] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [gridColumns, setGridColumns] = useState<number>(4);
  const [mainViewMode, setMainViewMode] = useState<"single" | "grid">("single");
  const [mainGridColumns, setMainGridColumns] = useState<number>(3);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [thumbnailPaths, setThumbnailPaths] = useState<Map<string, string>>(
    new Map(),
  );
  const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(true);
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);
  const [isAutoAdvance, setIsAutoAdvance] = useState<boolean>(false);
  const [autoAdvanceInterval, setAutoAdvanceInterval] = useState<number>(3);
  const [fullscreenDisplayMode, setFullscreenDisplayMode] = useState<
    "single" | "triple"
  >("single");
  const [isFullscreenUIVisible, setIsFullscreenUIVisible] =
    useState<boolean>(true);
  const hideUITimerRef = useRef<number | null>(null);
  const [currentMetadata, setCurrentMetadata] = useState<ImageMetadata | null>(
    null,
  );
  const [isMetadataEditorOpen, setIsMetadataEditorOpen] =
    useState<boolean>(false);
  const [editingMetadata, setEditingMetadata] = useState<ImageMetadata>({
    source: "",
    author: "",
    tags: [],
  });
  const [browseMode, setBrowseMode] = useState<
    "folders" | "metadata" | "favorites"
  >("folders");
  const [metadataGroups, setMetadataGroups] = useState<MetadataGroups | null>(
    null,
  );
  const [metadataField, setMetadataField] = useState<
    "sources" | "authors" | "tags"
  >("tags");
  const [selectedMetadataValue, setSelectedMetadataValue] =
    useState<string>("");
  const imageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const [isImageLoaded, setIsImageLoaded] = useState<boolean>(false);
  const [sortOrder, setSortOrder] = useState<"none" | "asc" | "desc">("none");
  const [showOnlyNoMetadata, setShowOnlyNoMetadata] = useState<boolean>(false);
  const [isAutoAdvanceReverse, setIsAutoAdvanceReverse] =
    useState<boolean>(false);
  const [imageMetadataMap, setImageMetadataMap] = useState<
    Map<string, ImageMetadata>
  >(new Map());
  const [isBulkEditMode, setIsBulkEditMode] = useState<boolean>(false);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [isBulkMetadataEditorOpen, setIsBulkMetadataEditorOpen] =
    useState<boolean>(false);
  const [tagInput, setTagInput] = useState<string>("");
  const [allExistingTags, setAllExistingTags] = useState<TagWithCount[]>([]);
  const [favoriteImages, setFavoriteImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (selectedFolder && browseMode === "folders") {
      loadImages(selectedFolder);
    }
  }, [selectedFolder, browseMode]);

  useEffect(() => {
    if (selectedFolder && selectedImage) {
      setIsImageLoaded(false);
      loadImagePath(selectedFolder, selectedImage);
      loadMetadata(selectedFolder, selectedImage);
      const index = images.indexOf(selectedImage);
      setCurrentImageIndex(index >= 0 ? index : 0);

      // サイドバーの画像リストで選択された画像にスクロール
      const imageElement = imageRefsMap.current.get(selectedImage);
      if (imageElement) {
        imageElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [selectedFolder, selectedImage, images]);

  useEffect(() => {
    if (isMetadataEditorOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsMetadataEditorOpen(false);
        } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          saveMetadata();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isMetadataEditorOpen, editingMetadata, selectedFolder, selectedImage]);

  useEffect(() => {
    if (isBulkMetadataEditorOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setIsBulkMetadataEditorOpen(false);
        } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          saveBulkMetadata();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isBulkMetadataEditorOpen, editingMetadata, selectedImages]);

  useEffect(() => {
    if (isFullscreen && !isMetadataEditorOpen && !isBulkMetadataEditorOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeFullscreen();
        } else if (e.key === "ArrowLeft") {
          prevImage();
        } else if (e.key === "ArrowRight") {
          nextImage();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [
    isFullscreen,
    currentImageIndex,
    isMetadataEditorOpen,
    isBulkMetadataEditorOpen,
  ]);

  useEffect(() => {
    if (
      mainViewMode === "single" &&
      !isFullscreen &&
      !isMetadataEditorOpen &&
      !isBulkMetadataEditorOpen
    ) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          prevImage();
        } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          nextImage();
        } else if ((e.metaKey || e.ctrlKey) && e.key === "e") {
          e.preventDefault();
          openMetadataEditor();
        } else if ((e.metaKey || e.ctrlKey) && e.key === "b") {
          e.preventDefault();
          if (selectedFolder && selectedImage) {
            const key = `${selectedFolder}/${selectedImage}`;
            setFavoriteImages((prev) => {
              const newSet = new Set(prev);
              if (newSet.has(key)) {
                newSet.delete(key);
              } else {
                newSet.add(key);
              }
              return newSet;
            });
          }
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [
    mainViewMode,
    isFullscreen,
    currentImageIndex,
    isMetadataEditorOpen,
    isBulkMetadataEditorOpen,
    selectedFolder,
    selectedImage,
  ]);

  useEffect(() => {
    if (isFullscreen && isAutoAdvance) {
      const timer = setInterval(() => {
        if (currentImageIndex < images.length - 1) {
          nextImage();
        } else {
          setIsAutoAdvance(false);
        }
      }, autoAdvanceInterval * 1000);
      return () => clearInterval(timer);
    }
  }, [
    isFullscreen,
    isAutoAdvance,
    currentImageIndex,
    autoAdvanceInterval,
    images.length,
  ]);

  useEffect(() => {
    if (isFullscreen && isAutoAdvanceReverse) {
      const timer = setInterval(() => {
        if (currentImageIndex > 0) {
          prevImage();
        } else {
          setIsAutoAdvanceReverse(false);
        }
      }, autoAdvanceInterval * 1000);
      return () => clearInterval(timer);
    }
  }, [
    isFullscreen,
    isAutoAdvanceReverse,
    currentImageIndex,
    autoAdvanceInterval,
  ]);

  useEffect(() => {
    if (browseMode === "metadata") {
      loadMetadataGroups();
    }
  }, [browseMode]);

  useEffect(() => {
    if (browseMode === "metadata" && selectedMetadataValue && metadataGroups) {
      const fieldData = metadataGroups[metadataField];
      const imageRefs = fieldData[selectedMetadataValue] || [];
      loadImagesFromReferences(imageRefs);
    }
  }, [browseMode, selectedMetadataValue, metadataField]);

  useEffect(() => {
    if (isFullscreen) {
      const handleMouseMove = () => {
        setIsFullscreenUIVisible(true);
        if (hideUITimerRef.current) {
          clearTimeout(hideUITimerRef.current);
        }
        hideUITimerRef.current = window.setTimeout(() => {
          setIsFullscreenUIVisible(false);
        }, 3000);
      };

      window.addEventListener("mousemove", handleMouseMove);
      // 初期タイマー設定
      hideUITimerRef.current = window.setTimeout(() => {
        setIsFullscreenUIVisible(false);
      }, 3000);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        if (hideUITimerRef.current) {
          clearTimeout(hideUITimerRef.current);
        }
      };
    } else {
      setIsFullscreenUIVisible(true);
    }
  }, [isFullscreen]);

  async function loadFolders() {
    try {
      const folderList = await invoke<FolderInfo[]>("get_image_folders");
      setFolders(folderList);
      if (folderList.length > 0) {
        setSelectedFolder(folderList[0].name);
      }
    } catch (error) {
      console.error("Failed to load folders:", error);
    }
  }

  async function loadImages(folder: string) {
    try {
      const imageList = await invoke<string[]>("get_images_in_folder", {
        folder,
      });
      setImages(imageList);

      // Load thumbnail paths and metadata for grid view
      const newThumbnailPaths = new Map<string, string>();
      const newMetadataMap = new Map<string, ImageMetadata>();
      for (const image of imageList) {
        try {
          const path = await invoke<string>("get_image_path", {
            folder,
            image,
          });
          newThumbnailPaths.set(image, path);

          // Load metadata for each image
          const metadata = await invoke<ImageMetadata | null>(
            "load_image_metadata",
            { folder, image },
          );
          if (metadata) {
            newMetadataMap.set(image, metadata);
          }
        } catch (err) {
          console.error(`Failed to load path for ${image}:`, err);
        }
      }
      setThumbnailPaths(newThumbnailPaths);
      setImageMetadataMap(newMetadataMap);

      if (imageList.length > 0) {
        setSelectedImage(imageList[0]);
      } else {
        setSelectedImage("");
        setImagePath("");
      }
    } catch (error) {
      console.error("Failed to load images:", error);
    }
  }

  async function loadImagePath(folder: string, image: string) {
    try {
      const path = await invoke<string>("get_image_path", { folder, image });
      setImagePath(path);
    } catch (error) {
      console.error("Failed to load image path:", error);
    }
  }

  async function loadMetadata(folder: string, image: string) {
    try {
      const metadata = await invoke<ImageMetadata | null>(
        "load_image_metadata",
        { folder, image },
      );
      setCurrentMetadata(metadata);
    } catch (error) {
      console.error("Failed to load metadata:", error);
      setCurrentMetadata(null);
    }
  }

  async function saveMetadata() {
    if (!selectedFolder || !selectedImage) return;

    try {
      await invoke("save_image_metadata", {
        folder: selectedFolder,
        image: selectedImage,
        source: editingMetadata.source,
        author: editingMetadata.author,
        tags: editingMetadata.tags,
      });
      setCurrentMetadata({ ...editingMetadata });
      // Update imageMetadataMap immediately
      setImageMetadataMap((prev) => {
        const newMap = new Map(prev);
        newMap.set(selectedImage, { ...editingMetadata });
        return newMap;
      });
      setIsMetadataEditorOpen(false);
      // Reload metadata groups if in metadata browse mode
      if (browseMode === "metadata") {
        loadMetadataGroups();
      }
      // Reload all tags
      loadAllTags();
    } catch (error) {
      console.error("Failed to save metadata:", error);
    }
  }

  async function saveBulkMetadata() {
    if (selectedImages.size === 0) return;

    try {
      for (const image of selectedImages) {
        await invoke("save_image_metadata", {
          folder: selectedFolder,
          image: image,
          source: editingMetadata.source,
          author: editingMetadata.author,
          tags: editingMetadata.tags,
        });
      }
      // Update imageMetadataMap for all selected images
      setImageMetadataMap((prev) => {
        const newMap = new Map(prev);
        selectedImages.forEach((image) => {
          newMap.set(image, { ...editingMetadata });
        });
        return newMap;
      });
      setIsBulkMetadataEditorOpen(false);
      setIsBulkEditMode(false);
      setSelectedImages(new Set());
      // Reload metadata groups if in metadata browse mode
      if (browseMode === "metadata") {
        loadMetadataGroups();
      }
      // Reload all tags
      loadAllTags();
    } catch (error) {
      console.error("Failed to save bulk metadata:", error);
    }
  }

  function toggleImageSelection(image: string) {
    const newSelection = new Set(selectedImages);
    if (newSelection.has(image)) {
      newSelection.delete(image);
    } else {
      newSelection.add(image);
    }
    setSelectedImages(newSelection);
  }

  function selectAllImages() {
    setSelectedImages(new Set(images));
  }

  function deselectAllImages() {
    setSelectedImages(new Set());
  }

  function openBulkMetadataEditor() {
    setEditingMetadata({ source: "", author: "", tags: [] });
    setIsBulkMetadataEditorOpen(true);
    loadAllTags();
  }

  function toggleBulkEditMode() {
    setIsBulkEditMode(!isBulkEditMode);
    if (isBulkEditMode) {
      setSelectedImages(new Set());
    }
  }

  async function loadMetadataGroups() {
    try {
      const groups = await invoke<MetadataGroups>("get_metadata_groups");
      setMetadataGroups(groups);
    } catch (error) {
      console.error("Failed to load metadata groups:", error);
    }
  }

  async function loadImagesFromReferences(refs: ImageReference[]) {
    const imageList = refs.map((ref) => ref.image);
    setImages(imageList);

    // Load thumbnail paths and metadata for all referenced images
    const newThumbnailPaths = new Map<string, string>();
    const newMetadataMap = new Map<string, ImageMetadata>();
    for (const ref of refs) {
      try {
        const path = await invoke<string>("get_image_path", {
          folder: ref.folder,
          image: ref.image,
        });
        newThumbnailPaths.set(ref.image, path);

        // Load metadata for each image
        const metadata = await invoke<ImageMetadata | null>(
          "load_image_metadata",
          { folder: ref.folder, image: ref.image },
        );
        if (metadata) {
          newMetadataMap.set(ref.image, metadata);
        }
      } catch (err) {
        console.error(`Failed to load path for ${ref.image}:`, err);
      }
    }
    setThumbnailPaths(newThumbnailPaths);
    setImageMetadataMap(newMetadataMap);

    if (refs.length > 0) {
      setSelectedFolder(refs[0].folder);
      setSelectedImage(refs[0].image);
    } else {
      setSelectedImage("");
      setImagePath("");
    }
  }

  async function openMetadataEditor() {
    // 最新のメタデータを読み込む
    if (selectedFolder && selectedImage) {
      try {
        const metadata = await invoke<ImageMetadata | null>(
          "load_image_metadata",
          {
            folder: selectedFolder,
            image: selectedImage,
          },
        );
        setCurrentMetadata(metadata);
        setEditingMetadata(metadata || { source: "", author: "", tags: [] });
        setIsMetadataEditorOpen(true);
        loadAllTags();
      } catch (error) {
        console.error("Failed to load metadata:", error);
        setEditingMetadata({ source: "", author: "", tags: [] });
        setIsMetadataEditorOpen(true);
        loadAllTags();
      }
    } else {
      setEditingMetadata(
        currentMetadata || { source: "", author: "", tags: [] },
      );
      setIsMetadataEditorOpen(true);
      loadAllTags();
    }
  }

  async function loadAllTags() {
    try {
      const tags = await invoke<TagWithCount[]>("get_all_tags_with_count");
      setAllExistingTags(tags);
    } catch (error) {
      console.error("Failed to load all tags:", error);
      setAllExistingTags([]);
    }
  }

  function addTag(tag: string) {
    const trimmedTag = tag.trim();
    if (trimmedTag && !editingMetadata.tags.includes(trimmedTag)) {
      setEditingMetadata({
        ...editingMetadata,
        tags: [...editingMetadata.tags, trimmedTag],
      });
      setTagInput("");
    }
  }

  function removeTag(tagToRemove: string) {
    setEditingMetadata({
      ...editingMetadata,
      tags: editingMetadata.tags.filter((tag) => tag !== tagToRemove),
    });
  }

  function handleTagInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(tagInput);
    }
  }

  function handleImageClick(image: string) {
    setSelectedImage(image);

    // Scroll to image in main grid if in grid mode
    if (mainViewMode === "grid") {
      setTimeout(() => {
        const imageElement = imageRefsMap.current.get(image);
        if (imageElement) {
          imageElement.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, 100);
    }
  }

  function handleZoomIn() {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  }

  function handleZoomOut() {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }

  function handleResetZoom() {
    setZoom(1);
  }

  function handleWheel(e: React.WheelEvent) {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    }
  }

  function openFullscreen(index: number) {
    setCurrentImageIndex(index);
    setIsFullscreen(true);
    setSelectedImage(images[index]);
  }

  function closeFullscreen() {
    setIsFullscreen(false);
    setZoom(1);
    setIsAutoAdvance(false);
    setIsAutoAdvanceReverse(false);
  }

  function nextImage() {
    if (currentImageIndex < images.length - 1) {
      const newIndex = currentImageIndex + 1;
      setCurrentImageIndex(newIndex);
      setSelectedImage(images[newIndex]);
    }
  }

  function prevImage() {
    if (currentImageIndex > 0) {
      const newIndex = currentImageIndex - 1;
      setCurrentImageIndex(newIndex);
      setSelectedImage(images[newIndex]);
    }
  }

  function getSortedImages() {
    let filteredImages = images;

    // メタ情報なしフィルター
    if (showOnlyNoMetadata) {
      filteredImages = images.filter((image) => {
        const metadata = imageMetadataMap.get(image);
        return (
          !metadata ||
          (!metadata.source && !metadata.author && metadata.tags.length === 0)
        );
      });
    }

    // ソート
    if (sortOrder === "none") {
      return filteredImages;
    }
    const sorted = [...filteredImages].sort((a, b) => {
      if (sortOrder === "asc") {
        return a.localeCompare(b);
      } else {
        return b.localeCompare(a);
      }
    });
    return sorted;
  }

  function toggleSortOrder() {
    if (sortOrder === "none") {
      setSortOrder("asc");
    } else if (sortOrder === "asc") {
      setSortOrder("desc");
    } else {
      setSortOrder("none");
    }
  }

  return (
    <div className="app">
      {isHeaderVisible && (
        <div className="custom-titlebar" data-tauri-drag-region>
          <div className="titlebar-content">
            <div className="titlebar-controls">
              <div className="view-mode-toggle">
                <button
                  className={mainViewMode === "single" ? "active" : ""}
                  onClick={() => setMainViewMode("single")}
                  disabled={images.length === 0}
                  title="単一表示"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <rect
                      x="2"
                      y="2"
                      width="12"
                      height="12"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                  </svg>
                </button>
                <button
                  className={mainViewMode === "grid" ? "active" : ""}
                  onClick={() => setMainViewMode("grid")}
                  disabled={images.length === 0}
                  title="グリッド表示"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 2H6V6H2V2ZM10 2H14V6H10V2ZM2 10H6V14H2V10ZM10 10H14V14H10V10Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
              {mainViewMode === "grid" && (
                <div className="grid-size-control">
                  <div className="grid-size-buttons">
                    <button
                      onClick={() =>
                        setMainGridColumns(Math.max(2, mainGridColumns - 1))
                      }
                      disabled={mainGridColumns <= 2 || images.length === 0}
                    >
                      &lt;
                    </button>
                    <span className="grid-count">{mainGridColumns}</span>
                    <button
                      onClick={() =>
                        setMainGridColumns(Math.min(12, mainGridColumns + 1))
                      }
                      disabled={mainGridColumns >= 12 || images.length === 0}
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              )}
              <button
                className="toggle-titlebar-btn"
                onClick={() => setIsHeaderVisible(false)}
                title="タイトルバーを隠す"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M4 10L8 6L12 10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
      {!isHeaderVisible && (
        <button
          className="show-titlebar-btn"
          onClick={() => setIsHeaderVisible(true)}
          title="タイトルバーを表示"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 12L10 7L15 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <div className="app-main-container">
        {isSidebarVisible && (
          <div className="sidebar">
            <div className="browse-mode-selector">
              <div className="browse-mode-buttons">
                <button
                  className={browseMode === "folders" ? "active" : ""}
                  onClick={() => setBrowseMode("folders")}
                >
                  フォルダ別
                </button>
                <button
                  className={browseMode === "metadata" ? "active" : ""}
                  onClick={() => setBrowseMode("metadata")}
                >
                  メタ別
                </button>
                <button
                  className={browseMode === "favorites" ? "active" : ""}
                  onClick={() => setBrowseMode("favorites")}
                >
                  ★
                </button>
              </div>
              <button
                className="toggle-sidebar-btn"
                onClick={() => setIsSidebarVisible(false)}
                title="サイドバーを隠す"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M10 4L6 8L10 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            {browseMode === "folders" ? (
              <>
                <div className="folder-list">
                  <h3>Folders</h3>
                  {folders.map((folder) => (
                    <div
                      key={folder.name}
                      className={`folder-item ${selectedFolder === folder.name ? "selected" : ""}`}
                      onClick={() => setSelectedFolder(folder.name)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M2 4C2 2.89543 2.89543 2 4 2H6L7 4H12C13.1046 4 14 4.89543 14 6V12C14 13.1046 13.1046 14 12 14H4C2.89543 14 2 13.1046 2 12V4Z"
                          fill="currentColor"
                          opacity="0.3"
                        />
                      </svg>
                      <span className="folder-name">{folder.name}</span>
                      <span className="folder-size">
                        {folder.size_mb.toFixed(0)}MB
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : browseMode === "metadata" ? (
              <div className="metadata-browser">
                <div className="metadata-field-tabs">
                  <button
                    className={metadataField === "tags" ? "active" : ""}
                    onClick={() => {
                      setMetadataField("tags");
                      setSelectedMetadataValue("");
                      setImages([]);
                      setSelectedImage("");
                      setImagePath("");
                    }}
                  >
                    タグ
                  </button>
                  <button
                    className={metadataField === "sources" ? "active" : ""}
                    onClick={() => {
                      setMetadataField("sources");
                      setSelectedMetadataValue("");
                      setImages([]);
                      setSelectedImage("");
                      setImagePath("");
                    }}
                  >
                    元ネタ
                  </button>
                  <button
                    className={metadataField === "authors" ? "active" : ""}
                    onClick={() => {
                      setMetadataField("authors");
                      setSelectedMetadataValue("");
                      setImages([]);
                      setSelectedImage("");
                      setImagePath("");
                    }}
                  >
                    作者
                  </button>
                </div>
                <div className="metadata-values-list">
                  <h3>
                    {metadataField === "tags" && "タグ一覧"}
                    {metadataField === "sources" && "元ネタ一覧"}
                    {metadataField === "authors" && "作者一覧"}
                  </h3>
                  {metadataGroups &&
                    Object.keys(metadataGroups[metadataField]).length === 0 && (
                      <p className="no-metadata">データがありません</p>
                    )}
                  {metadataGroups &&
                    Object.entries(metadataGroups[metadataField]).map(
                      ([value, refs]) => (
                        <div
                          key={value}
                          className={`metadata-value-item ${selectedMetadataValue === value ? "selected" : ""}`}
                          onClick={() => setSelectedMetadataValue(value)}
                        >
                          <span className="value-name">{value}</span>
                          <span className="value-count">({refs.length})</span>
                        </div>
                      ),
                    )}
                </div>
              </div>
            ) : browseMode === "favorites" ? (
              <div className="favorites-browser">
                <div className="favorites-list">
                  <h3>お気に入り ({favoriteImages.size})</h3>
                  {favoriteImages.size === 0 && (
                    <p className="no-favorites">お気に入りがありません</p>
                  )}
                  {Array.from(favoriteImages).map((favKey) => {
                    const [folder, image] = favKey.split("/");
                    return (
                      <div
                        key={favKey}
                        className={`favorite-item ${selectedFolder === folder && selectedImage === image ? "selected" : ""}`}
                        onClick={() => {
                          setSelectedFolder(folder);
                          setSelectedImage(image);
                          handleImageClick(image);
                        }}
                      >
                        <span className="favorite-image-name">{image}</span>
                        <span className="favorite-folder-name">({folder})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="view-controls">
              <div className="bulk-edit-controls">
                <button
                  className={`bulk-edit-toggle ${isBulkEditMode ? "active" : ""}`}
                  onClick={toggleBulkEditMode}
                  title="一括編集モード"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 3L6 3M3 8L6 8M3 13L6 13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <rect
                      x="9"
                      y="2"
                      width="2"
                      height="2"
                      fill="currentColor"
                    />
                    <rect
                      x="9"
                      y="7"
                      width="2"
                      height="2"
                      fill="currentColor"
                    />
                    <rect
                      x="9"
                      y="12"
                      width="2"
                      height="2"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                {isBulkEditMode && (
                  <>
                    <button
                      className="select-all-btn"
                      onClick={selectAllImages}
                      title="全て選択"
                    >
                      全選択
                    </button>
                    <button
                      className="deselect-all-btn"
                      onClick={deselectAllImages}
                      title="全て解除"
                    >
                      解除
                    </button>
                    <button
                      className="bulk-edit-btn"
                      onClick={openBulkMetadataEditor}
                      disabled={selectedImages.size === 0}
                      title={`選択した${selectedImages.size}件を編集`}
                    >
                      編集({selectedImages.size})
                    </button>
                  </>
                )}
              </div>
              <div className="view-mode-toggle">
                <button
                  className={viewMode === "list" ? "active" : ""}
                  onClick={() => setViewMode("list")}
                  title="リスト表示"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 4H14M2 8H14M2 12H14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <button
                  className={viewMode === "grid" ? "active" : ""}
                  onClick={() => setViewMode("grid")}
                  title="グリッド表示"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 2H6V6H2V2ZM10 2H14V6H10V2ZM2 10H6V14H2V10ZM10 10H14V14H10V10Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
              {viewMode === "grid" && (
                <div className="grid-size-control">
                  <label>グリッド数</label>
                  <div className="grid-size-buttons">
                    <button
                      onClick={() =>
                        setGridColumns(Math.max(3, gridColumns - 1))
                      }
                      disabled={gridColumns <= 3}
                    >
                      &lt;
                    </button>
                    <span className="grid-count">{gridColumns}</span>
                    <button
                      onClick={() =>
                        setGridColumns(Math.min(6, gridColumns + 1))
                      }
                      disabled={gridColumns >= 6}
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="image-list">
              <div className="image-list-header">
                <h3>画像一覧 ({getSortedImages().length})</h3>
                <div className="list-controls">
                  <button
                    className={`filter-btn ${showOnlyNoMetadata ? "active" : ""}`}
                    onClick={() => setShowOnlyNoMetadata(!showOnlyNoMetadata)}
                    title={
                      showOnlyNoMetadata ? "すべて表示" : "メタ情報なしのみ表示"
                    }
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M2 4H14M4 8H12M6 12H10"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <button
                    className={`sort-btn ${sortOrder !== "none" ? "active" : ""}`}
                    onClick={toggleSortOrder}
                    title={
                      sortOrder === "none"
                        ? "ソート: なし"
                        : sortOrder === "asc"
                          ? "ソート: A-Z"
                          : "ソート: Z-A"
                    }
                  >
                    {sortOrder === "asc" && "A-Z"}
                    {sortOrder === "desc" && "Z-A"}
                    {sortOrder === "none" && "↑↓"}
                  </button>
                </div>
              </div>
              {images.length === 0 && selectedFolder && (
                <p className="no-images">画像がありません</p>
              )}
              {viewMode === "list" &&
                getSortedImages().map((image, _index) => (
                  <div
                    key={image}
                    ref={(el) => {
                      if (el) {
                        imageRefsMap.current.set(image, el);
                      } else {
                        imageRefsMap.current.delete(image);
                      }
                    }}
                    className={`image-item ${selectedImage === image ? "selected" : ""}`}
                    onClick={() => handleImageClick(image)}
                  >
                    {image}
                  </div>
                ))}
              {viewMode === "grid" && (
                <div
                  className="image-grid"
                  style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}
                >
                  {getSortedImages().map((image, _index) => {
                    const thumbPath = thumbnailPaths.get(image);
                    const metadata = imageMetadataMap.get(image);
                    const hasMetadata =
                      metadata &&
                      (metadata.source ||
                        metadata.author ||
                        metadata.tags.length > 0);
                    const isSelected = selectedImages.has(image);
                    const isCurrentImage = selectedImage === image;
                    return (
                      <div
                        key={image}
                        ref={(el) => {
                          if (el) {
                            imageRefsMap.current.set(image, el);
                          } else {
                            imageRefsMap.current.delete(image);
                          }
                        }}
                        className={`grid-item ${isSelected ? "selected-for-edit" : ""} ${isCurrentImage ? "current-image" : ""}`}
                        onClick={() =>
                          isBulkEditMode
                            ? toggleImageSelection(image)
                            : handleImageClick(image)
                        }
                        title={image}
                      >
                        {isBulkEditMode && (
                          <div className="selection-checkbox">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleImageSelection(image)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        )}
                        <div className="grid-item-thumbnail">
                          {thumbPath ? (
                            <img src={convertFileSrc(thumbPath)} alt={image} />
                          ) : (
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <path
                                d="M4 4H20V20H4V4Z"
                                stroke="currentColor"
                                strokeWidth="2"
                              />
                              <path
                                d="M4 16L8 12L12 16L16 12L20 16"
                                stroke="currentColor"
                                strokeWidth="2"
                              />
                            </svg>
                          )}
                          {hasMetadata && (
                            <div className="metadata-tag-icon">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#ff6a00"
                                strokeWidth="3.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
                                <circle
                                  cx="7.5"
                                  cy="7.5"
                                  r=".5"
                                  fill="#ff6a00"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                        {/* <div className="grid-item-name">{image}</div> */}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        {!isSidebarVisible && (
          <button
            className="show-sidebar-btn"
            onClick={() => setIsSidebarVisible(true)}
            title="サイドバーを表示"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M7 5L12 10L7 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <div className="main-content" onWheel={handleWheel}>
          {mainViewMode === "single" && imagePath && (
            <div className="main-single-view">
              <div className="zoom-controls">
                <button
                  onClick={handleZoomOut}
                  title="縮小 (Ctrl + スクロール)"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 8H12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                <button onClick={handleZoomIn} title="拡大 (Ctrl + スクロール)">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 4V12M4 8H12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                <button
                  className="reset-zoom-btn"
                  onClick={handleResetZoom}
                  title="リセット"
                >
                  Reset
                </button>
              </div>
              {currentMetadata && (
                <div className="metadata-display">
                  <div className="metadata-item">
                    <strong>タグ:</strong>{" "}
                    {currentMetadata.tags.length > 0
                      ? currentMetadata.tags.join(", ")
                      : "不明"}
                  </div>
                  <div className="metadata-item">
                    <strong>元ネタ:</strong> {currentMetadata.source || "不明"}
                  </div>
                  <div className="metadata-item">
                    <strong>作者:</strong> {currentMetadata.author || "不明"}
                  </div>
                </div>
              )}
              <button
                className="edit-metadata-btn"
                onClick={openMetadataEditor}
                title="情報を編集 (Cmd + E)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="btn-label">(Cmd + E)</span>
              </button>
              <button
                className={`favorite-btn ${selectedImage && favoriteImages.has(`${selectedFolder}/${selectedImage}`) ? "active" : ""}`}
                onClick={() => {
                  if (selectedFolder && selectedImage) {
                    const key = `${selectedFolder}/${selectedImage}`;
                    setFavoriteImages((prev) => {
                      const newSet = new Set(prev);
                      if (newSet.has(key)) {
                        newSet.delete(key);
                      } else {
                        newSet.add(key);
                      }
                      return newSet;
                    });
                  }
                }}
                title="お気に入り (Cmd + B)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 2L9.5 6.5H14L10.5 9.5L12 14L8 11L4 14L5.5 9.5L2 6.5H6.5L8 2Z"
                    fill={
                      selectedImage &&
                      favoriteImages.has(`${selectedFolder}/${selectedImage}`)
                        ? "#FFD700"
                        : "none"
                    }
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="btn-label">(Cmd + B)</span>
              </button>
              <div className="image-container">
                <img
                  src={convertFileSrc(imagePath)}
                  alt={selectedImage}
                  className={`main-image ${isImageLoaded ? "loaded" : ""}`}
                  style={{ transform: `scale(${zoom})`, cursor: "pointer" }}
                  onClick={() => openFullscreen(currentImageIndex)}
                  onLoad={() => setIsImageLoaded(true)}
                />
              </div>
            </div>
          )}
          {mainViewMode === "grid" && images.length > 0 && (
            <div className="main-grid-container">
              <div
                className="main-image-grid"
                style={{
                  gridTemplateColumns: `repeat(${mainGridColumns}, 1fr)`,
                }}
              >
                {images.map((image, index) => {
                  const thumbPath = thumbnailPaths.get(image);
                  return (
                    <div
                      key={image}
                      ref={(el) => {
                        if (el) {
                          imageRefsMap.current.set(image, el);
                        } else {
                          imageRefsMap.current.delete(image);
                        }
                      }}
                      className={`main-grid-item ${selectedImage === image ? "selected" : ""}`}
                      onClick={() => openFullscreen(index)}
                      title={image}
                    >
                      {thumbPath ? (
                        <img src={convertFileSrc(thumbPath)} alt={image} />
                      ) : (
                        <div className="placeholder">読込中...</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!imagePath && folders.length === 0 && (
            <div className="no-content">
              <p>~/.config/waifurary/images フォルダに画像を配置してください</p>
            </div>
          )}
          {!imagePath && folders.length > 0 && images.length === 0 && (
            <div className="no-content">
              <p>選択したフォルダに画像がありません</p>
            </div>
          )}
        </div>
      </div>
      {isFullscreen && (
        <div className="fullscreen-viewer" onClick={closeFullscreen}>
          <button
            className={`close-btn ${isFullscreenUIVisible ? "visible" : "hidden"}`}
            onClick={closeFullscreen}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6L18 18M6 18L18 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div
            className={`auto-advance-controls ${isFullscreenUIVisible ? "visible" : "hidden"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={`auto-advance-toggle reverse ${isAutoAdvanceReverse ? "active" : ""}`}
              onClick={() => {
                setIsAutoAdvanceReverse(!isAutoAdvanceReverse);
                if (!isAutoAdvanceReverse) setIsAutoAdvance(false);
              }}
              title={isAutoAdvanceReverse ? "逆再生を停止" : "逆再生を開始"}
            >
              {isAutoAdvanceReverse ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M6 5H8V15H6V5ZM12 5H14V15H12V5Z"
                    fill="currentColor"
                  />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M14 4L5 10L14 16V4Z" fill="currentColor" />
                </svg>
              )}
            </button>
            <button
              className={`auto-advance-toggle ${isAutoAdvance ? "active" : ""}`}
              onClick={() => {
                setIsAutoAdvance(!isAutoAdvance);
                if (!isAutoAdvance) setIsAutoAdvanceReverse(false);
              }}
              title={isAutoAdvance ? "自動送りを停止" : "自動送りを開始"}
            >
              {isAutoAdvance ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M6 5H8V15H6V5ZM12 5H14V15H12V5Z"
                    fill="currentColor"
                  />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M6 4L15 10L6 16V4Z" fill="currentColor" />
                </svg>
              )}
            </button>
            <div className="interval-controls">
              <button
                onClick={() =>
                  setAutoAdvanceInterval(Math.max(1, autoAdvanceInterval - 1))
                }
                disabled={autoAdvanceInterval <= 1}
              >
                &lt;
              </button>
              <span>{autoAdvanceInterval}秒</span>
              <button
                onClick={() =>
                  setAutoAdvanceInterval(Math.min(5, autoAdvanceInterval + 1))
                }
                disabled={autoAdvanceInterval >= 5}
              >
                &gt;
              </button>
            </div>
          </div>
          <button
            className={`nav-btn prev ${isFullscreenUIVisible ? "visible" : "hidden"}`}
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M20 8L12 16L20 24"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className={`nav-btn next ${isFullscreenUIVisible ? "visible" : "hidden"}`}
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path
                d="M12 8L20 16L12 24"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div
            className={`fullscreen-display-toggle ${isFullscreenUIVisible ? "visible" : "hidden"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={fullscreenDisplayMode === "single" ? "active" : ""}
              onClick={() => setFullscreenDisplayMode("single")}
              title="1枚表示"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect
                  x="4"
                  y="4"
                  width="12"
                  height="12"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
            </button>
            <button
              className={fullscreenDisplayMode === "triple" ? "active" : ""}
              onClick={() => setFullscreenDisplayMode("triple")}
              title="3枚表示"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect
                  x="2"
                  y="4"
                  width="5"
                  height="12"
                  fill="currentColor"
                  opacity="0.4"
                />
                <rect x="7.5" y="4" width="5" height="12" fill="currentColor" />
                <rect
                  x="13"
                  y="4"
                  width="5"
                  height="12"
                  fill="currentColor"
                  opacity="0.4"
                />
              </svg>
            </button>
          </div>
          {fullscreenDisplayMode === "single" ? (
            <div
              className="fullscreen-image-container"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={convertFileSrc(imagePath)}
                alt={selectedImage}
                className="fullscreen-image"
              />
            </div>
          ) : (
            <div
              className="fullscreen-triple-container"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="triple-image prev-image">
                {currentImageIndex > 0 && (
                  <img
                    src={convertFileSrc(
                      thumbnailPaths.get(images[currentImageIndex - 1]) || "",
                    )}
                    alt={images[currentImageIndex - 1]}
                  />
                )}
              </div>
              <div className="triple-image current-image">
                <img src={convertFileSrc(imagePath)} alt={selectedImage} />
              </div>
              <div className="triple-image next-image">
                {currentImageIndex < images.length - 1 && (
                  <img
                    src={convertFileSrc(
                      thumbnailPaths.get(images[currentImageIndex + 1]) || "",
                    )}
                    alt={images[currentImageIndex + 1]}
                  />
                )}
              </div>
            </div>
          )}
          <div
            className={`fullscreen-info ${isFullscreenUIVisible ? "visible" : "hidden"}`}
          >
            {currentImageIndex + 1} / {images.length} - {selectedImage}
          </div>
        </div>
      )}
      {isMetadataEditorOpen && (
        <div
          className="metadata-editor-modal"
          onClick={() => setIsMetadataEditorOpen(false)}
        >
          <div
            className="metadata-editor-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-btn"
              onClick={() => setIsMetadataEditorOpen(false)}
              title="閉じる (Esc)"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6L18 18M6 18L18 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <h3>画像情報の編集</h3>
            <div className="metadata-form">
              <div className="metadata-form-left">
                <div className="form-group">
                  <label>元ネタ</label>
                  <input
                    type="text"
                    value={editingMetadata.source}
                    onChange={(e) =>
                      setEditingMetadata({
                        ...editingMetadata,
                        source: e.target.value,
                      })
                    }
                    placeholder="例: 作品名、シリーズ名"
                  />
                </div>
                <div className="form-group">
                  <label>作者</label>
                  <input
                    type="text"
                    value={editingMetadata.author}
                    onChange={(e) =>
                      setEditingMetadata({
                        ...editingMetadata,
                        author: e.target.value,
                      })
                    }
                    placeholder="例: イラストレーター名"
                  />
                </div>
                <div className="form-group">
                  <label>タグ</label>
                  <div className="tag-input-container">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagInputKeyDown}
                      placeholder="タグを入力してEnter"
                    />
                    <button
                      type="button"
                      className="add-tag-btn"
                      onClick={() => addTag(tagInput)}
                    >
                      追加
                    </button>
                  </div>
                  {editingMetadata.tags.length > 0 && (
                    <div className="current-tags">
                      {editingMetadata.tags.map((tag) => (
                        <span key={tag} className="tag-chip">
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="remove-tag-btn"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="metadata-form-right">
                {allExistingTags.length > 0 && (
                  <div className="existing-tags">
                    <div className="existing-tags-label">既存のタグ:</div>
                    <div className="existing-tags-list">
                      {allExistingTags
                        .filter(
                          (tagData) =>
                            !editingMetadata.tags.includes(tagData.tag),
                        )
                        .map((tagData) => (
                          <button
                            key={tagData.tag}
                            type="button"
                            className="existing-tag-btn"
                            onClick={() => addTag(tagData.tag)}
                          >
                            {tagData.tag} ({tagData.count})
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="metadata-editor-actions">
              <button
                className="cancel-btn"
                onClick={() => setIsMetadataEditorOpen(false)}
              >
                キャンセル (Esc)
              </button>
              <button className="save-btn" onClick={saveMetadata}>
                保存 (Cmd + Enter)
              </button>
            </div>
          </div>
        </div>
      )}
      {isBulkMetadataEditorOpen && (
        <div
          className="metadata-editor-modal"
          onClick={() => setIsBulkMetadataEditorOpen(false)}
        >
          <div
            className="metadata-editor-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-btn"
              onClick={() => setIsBulkMetadataEditorOpen(false)}
              title="閉じる (Esc)"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6L18 18M6 18L18 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <h3>一括編集 ({selectedImages.size}件)</h3>
            <div className="metadata-form">
              <div className="form-group">
                <label>元ネタ</label>
                <input
                  type="text"
                  value={editingMetadata.source}
                  onChange={(e) =>
                    setEditingMetadata({
                      ...editingMetadata,
                      source: e.target.value,
                    })
                  }
                  placeholder="例: 作品名、シリーズ名"
                />
              </div>
              <div className="form-group">
                <label>作者</label>
                <input
                  type="text"
                  value={editingMetadata.author}
                  onChange={(e) =>
                    setEditingMetadata({
                      ...editingMetadata,
                      author: e.target.value,
                    })
                  }
                  placeholder="例: イラストレーター名"
                />
              </div>
              <div className="form-group">
                <label>タグ</label>
                <div className="tag-input-container">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    placeholder="タグを入力してEnter"
                  />
                  <button
                    type="button"
                    className="add-tag-btn"
                    onClick={() => addTag(tagInput)}
                  >
                    追加
                  </button>
                </div>
                {editingMetadata.tags.length > 0 && (
                  <div className="current-tags">
                    {editingMetadata.tags.map((tag) => (
                      <span key={tag} className="tag-chip">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="remove-tag-btn"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {allExistingTags.length > 0 && (
                  <div className="existing-tags">
                    <div className="existing-tags-label">既存のタグ:</div>
                    <div className="existing-tags-list">
                      {allExistingTags
                        .filter(
                          (tagData) =>
                            !editingMetadata.tags.includes(tagData.tag),
                        )
                        .map((tagData) => (
                          <button
                            key={tagData.tag}
                            type="button"
                            className="existing-tag-btn"
                            onClick={() => addTag(tagData.tag)}
                          >
                            {tagData.tag} ({tagData.count})
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="metadata-editor-actions">
              <button
                className="cancel-btn"
                onClick={() => setIsBulkMetadataEditorOpen(false)}
              >
                キャンセル (Esc)
              </button>
              <button className="save-btn" onClick={saveBulkMetadata}>
                保存 (Cmd + Enter)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
