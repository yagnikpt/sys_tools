package utils

import (
	"fmt"
	"strconv"
	"strings"
)

func StringValue(value any) (string, error) {
	v, ok := value.(string)
	if !ok {
		return "", fmt.Errorf("must be a string")
	}
	return v, nil
}

func IntValue(value any) (int, error) {
	switch v := value.(type) {
	case int:
		return v, nil
	case int64:
		return int(v), nil
	case float64:
		if v != float64(int(v)) {
			return 0, fmt.Errorf("must be an integer")
		}
		return int(v), nil
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(v))
		if err != nil {
			return 0, fmt.Errorf("must be an integer")
		}
		return n, nil
	default:
		return 0, fmt.Errorf("must be an integer")
	}
}
