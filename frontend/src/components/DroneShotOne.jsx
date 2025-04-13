// Format checkpoints to ensure they are in the correct format
const formatCheckpoints = (checkpoints) => {
  if (!checkpoints || !Array.isArray(checkpoints) || checkpoints.length === 0) {
    return [];
  }

  return checkpoints
    .map((checkpoint) => {
      // If checkpoint is already an array of [longitude, latitude], return it as is
      if (Array.isArray(checkpoint)) {
        return checkpoint;
      }

      // If checkpoint is an object with longitude and latitude, extract those values
      // (ignore any position field, we only need the coordinates)
      if (
        checkpoint &&
        typeof checkpoint === "object" &&
        "longitude" in checkpoint &&
        "latitude" in checkpoint
      ) {
        return [checkpoint.longitude, checkpoint.latitude];
      }

      console.error("Invalid checkpoint format:", checkpoint);
      return null;
    })
    .filter((cp) => cp !== null);
};
